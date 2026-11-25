import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  runBusinessInsights,
  runClinicalCheck,
  runPharmacyCopilot,
} from './server/ai.ts';
import {
  loadDatabase,
  recalculateCustomerDebts,
  ROLE_TEMPLATES,
  roundMoney,
  saveDatabase,
} from './server/store.ts';
import type {
  Branch,
  Customer,
  Invoice,
  InvoiceItem,
  Medicine,
  PaymentMethod,
  PermissionKey,
  PharmacyDatabase,
  StaffRole,
  StaffUser,
} from './src/types.ts';

function getActingUser(db: PharmacyDatabase, req: Request): StaffUser | undefined {
  const userId = req.header('x-user-id');
  if (userId) {
    const found = db.users.find((u) => u.id === userId && u.enabled);
    if (found) return found;
  }
  return db.users.find((u) => u.enabled) || db.users[0];
}

function requirePermission(
  db: PharmacyDatabase,
  req: Request,
  res: Response,
  perm: PermissionKey
): StaffUser | null {
  const user = getActingUser(db, req);
  if (!user) {
    res.status(401).json({ error: 'No active staff session.' });
    return null;
  }
  if (!user.permissions[perm]) {
    res.status(403).json({
      error: `Access denied: ${user.name} (${user.role}) lacks permission "${perm}".`,
    });
    return null;
  }
  return user;
}

function addAudit(
  db: PharmacyDatabase,
  user: StaffUser,
  branchName: string,
  action: string,
  details: string
): void {
  db.auditLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    branchName,
    action,
    details,
  });
  if (db.auditLogs.length > 250) {
    db.auditLogs = db.auditLogs.slice(0, 250);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/bootstrap', (_req, res) => {
    const db = loadDatabase();
    recalculateCustomerDebts(db);
    res.json(db);
  });

  // --- POS: Create Invoice / Sale (Full Cash, Partial Payment -> Debt, or Full Credit -> Debt) ---
  app.post('/api/invoices', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'pos.sell');
    if (!user) return;

    const {
      branchId,
      customerId,
      items,
      overallDiscountAmount = 0,
      taxRate,
      amountPaid = 0,
      paymentMethod = 'Cash',
      dueDate,
      invoiceTheme,
      invoiceLayout,
      notes = '',
    } = req.body as {
      branchId: string;
      customerId: string;
      items: Array<{
        medicineId: string;
        quantity: number;
        unitPrice?: number;
        discountPercent?: number;
      }>;
      overallDiscountAmount?: number;
      taxRate?: number;
      amountPaid?: number;
      paymentMethod?: PaymentMethod;
      dueDate?: string;
      invoiceTheme?: Invoice['invoiceTheme'];
      invoiceLayout?: Invoice['invoiceLayout'];
      notes?: string;
    };

    const branch = db.branches.find((b) => b.id === branchId && b.enabled);
    if (!branch) {
      res.status(400).json({ error: 'Selected branch is invalid or disabled.' });
      return;
    }

    const customer = db.customers.find((c) => c.id === customerId && c.enabled);
    if (!customer) {
      res.status(400).json({ error: 'Selected customer is invalid or disabled.' });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart cannot be empty.' });
      return;
    }

    const builtItems: InvoiceItem[] = [];
    for (const reqItem of items) {
      const med = db.medicines.find((m) => m.id === reqItem.medicineId && m.enabled);
      if (!med) {
        res.status(400).json({ error: `Medicine ${reqItem.medicineId} not found or disabled.` });
        return;
      }
      const lot = med.branchStock[branch.id];
      if (!lot || lot.quantity < reqItem.quantity) {
        res.status(400).json({
          error: `Insufficient stock for ${med.name} at ${branch.name} (Available: ${lot?.quantity ?? 0}).`,
        });
        return;
      }
      const qty = Math.max(1, Math.floor(reqItem.quantity));
      const unitPrice =
        typeof reqItem.unitPrice === 'number' && reqItem.unitPrice >= 0
          ? reqItem.unitPrice
          : med.sellingPrice;
      const discountPercent = Math.min(100, Math.max(0, reqItem.discountPercent ?? 0));
      if (discountPercent > 0 && !user.permissions['pos.discount']) {
        res.status(403).json({ error: 'You do not have permission to apply discounts.' });
        return;
      }
      const gross = unitPrice * qty;
      const lineTotal = roundMoney(gross * (1 - discountPercent / 100));
      builtItems.push({
        medicineId: med.id,
        name: med.name,
        strength: med.strength,
        batchNumber: lot.batchNumber,
        expiryDate: lot.expiryDate,
        quantity: qty,
        unitPrice: roundMoney(unitPrice),
        costPrice: roundMoney(med.costPrice),
        discountPercent,
        lineTotal,
      });
    }

    const itemSubtotal = roundMoney(builtItems.reduce((s, it) => s + it.lineTotal, 0));
    const extraDiscount = roundMoney(Math.max(0, Math.min(itemSubtotal, overallDiscountAmount)));
    if (extraDiscount > 0 && !user.permissions['pos.discount']) {
      res.status(403).json({ error: 'You do not have permission to apply invoice discounts.' });
      return;
    }

    const appliedTaxRate = typeof taxRate === 'number' ? Math.max(0, taxRate) : db.settings.taxRate;
    const taxableBase = Math.max(0, itemSubtotal - extraDiscount);
    const taxAmount = roundMoney((taxableBase * appliedTaxRate) / 100);
    const grandTotal = roundMoney(taxableBase + taxAmount);

    const paidNow = roundMoney(Math.max(0, Math.min(grandTotal, amountPaid)));
    const balanceDue = roundMoney(Math.max(0, grandTotal - paidNow));

    if (balanceDue > 0) {
      if (!db.settings.allowCreditSales) {
        res.status(400).json({ error: 'Credit sales are disabled in Pharmacy Settings.' });
        return;
      }
      if (!user.permissions['pos.credit_sale']) {
        res.status(403).json({ error: 'Your role cannot authorize credit/debt sales.' });
        return;
      }
      if (customer.id === 'cust-walkin') {
        res.status(400).json({
          error: 'Walk-In Cash Customer cannot carry debt. Select or create a named customer account.',
        });
        return;
      }
      if (customer.currentDebt + balanceDue > customer.creditLimit) {
        res.status(400).json({
          error: `Credit limit exceeded for ${customer.name}. Limit: ${db.settings.currencySymbol}${customer.creditLimit.toFixed(2)}, Current Debt: ${db.settings.currencySymbol}${customer.currentDebt.toFixed(2)}, New Balance: ${db.settings.currencySymbol}${balanceDue.toFixed(2)}.`,
        });
        return;
      }
    }

    // Deduct branch inventory
    for (const item of builtItems) {
      const med = db.medicines.find((m) => m.id === item.medicineId)!;
      med.branchStock[branch.id].quantity -= item.quantity;
    }

    const seq = 1044 + db.invoices.length;
    const nowIso = new Date().toISOString();
    const paymentStatus: Invoice['paymentStatus'] =
      balanceDue <= 0.005 ? 'PAID' : paidNow > 0 ? 'PARTIAL' : 'UNPAID';

    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-${new Date().getFullYear()}-${seq}`,
      branchId: branch.id,
      branchName: branch.name,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      cashierId: user.id,
      cashierName: user.name,
      createdAt: nowIso,
      updatedAt: nowIso,
      dueDate:
        dueDate ||
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      items: builtItems,
      subtotal: itemSubtotal,
      discountTotal: extraDiscount,
      taxRate: appliedTaxRate,
      taxAmount,
      grandTotal,
      amountPaid: paidNow,
      balanceDue,
      paymentStatus,
      paymentHistory:
        paidNow > 0
          ? [
              {
                id: `pay-${Date.now()}`,
                date: nowIso,
                amount: paidNow,
                method: paymentMethod,
                note: balanceDue > 0 ? 'Partial payment at POS' : 'Settled in full at POS',
                recordedBy: user.name,
              },
            ]
          : [],
      enabled: true,
      invoiceTheme: invoiceTheme || db.settings.defaultInvoiceTheme,
      invoiceLayout: invoiceLayout || db.settings.defaultInvoiceLayout,
      notes,
    };

    db.invoices.unshift(invoice);
    customer.lastTransactionAt = nowIso;
    recalculateCustomerDebts(db);
    addAudit(
      db,
      user,
      branch.name,
      'Sale Completed',
      `Issued ${invoice.invoiceNumber} to ${customer.name} · Total ${db.settings.currencySymbol}${grandTotal.toFixed(2)} · Status: ${paymentStatus}`
    );
    saveDatabase(db);
    res.status(201).json({ invoice, db });
  });

  // --- Edit Existing Invoice ---
  app.put('/api/invoices/:id', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'invoices.edit');
    if (!user) return;

    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    const {
      customerId,
      items,
      discountTotal,
      taxRate,
      dueDate,
      invoiceTheme,
      invoiceLayout,
      notes,
    } = req.body as {
      customerId?: string;
      items?: Array<{
        medicineId: string;
        quantity: number;
        unitPrice: number;
        discountPercent: number;
      }>;
      discountTotal?: number;
      taxRate?: number;
      dueDate?: string;
      invoiceTheme?: Invoice['invoiceTheme'];
      invoiceLayout?: Invoice['invoiceLayout'];
      notes?: string;
    };

    // If items are edited and invoice is enabled, restore old stock first then apply new
    if (Array.isArray(items) && items.length > 0) {
      if (inv.enabled) {
        for (const oldItem of inv.items) {
          const med = db.medicines.find((m) => m.id === oldItem.medicineId);
          if (med && med.branchStock[inv.branchId]) {
            med.branchStock[inv.branchId].quantity += oldItem.quantity;
          }
        }
      }

      const nextItems: InvoiceItem[] = [];
      for (const reqItem of items) {
        const med = db.medicines.find((m) => m.id === reqItem.medicineId);
        if (!med) {
          res.status(400).json({ error: `Medicine ${reqItem.medicineId} not found.` });
          return;
        }
        const lot = med.branchStock[inv.branchId];
        const qty = Math.max(1, Math.floor(reqItem.quantity));
        if (inv.enabled && (!lot || lot.quantity < qty)) {
          // rollback restored stock before returning error
          for (const oldItem of inv.items) {
            const oldMed = db.medicines.find((m) => m.id === oldItem.medicineId);
            if (oldMed && oldMed.branchStock[inv.branchId]) {
              oldMed.branchStock[inv.branchId].quantity -= oldItem.quantity;
            }
          }
          res.status(400).json({
            error: `Insufficient stock for ${med.name} at ${inv.branchName}.`,
          });
          return;
        }
        const unitPrice = roundMoney(Math.max(0, reqItem.unitPrice));
        const discountPercent = Math.min(100, Math.max(0, reqItem.discountPercent || 0));
        const lineTotal = roundMoney(unitPrice * qty * (1 - discountPercent / 100));
        nextItems.push({
          medicineId: med.id,
          name: med.name,
          strength: med.strength,
          batchNumber: lot?.batchNumber || 'N/A',
          expiryDate: lot?.expiryDate || '',
          quantity: qty,
          unitPrice,
          costPrice: med.costPrice,
          discountPercent,
          lineTotal,
        });
      }

      if (inv.enabled) {
        for (const ni of nextItems) {
          const med = db.medicines.find((m) => m.id === ni.medicineId);
          if (med && med.branchStock[inv.branchId]) {
            med.branchStock[inv.branchId].quantity -= ni.quantity;
          }
        }
      }
      inv.items = nextItems;
    }

    if (customerId) {
      const cust = db.customers.find((c) => c.id === customerId);
      if (cust) {
        inv.customerId = cust.id;
        inv.customerName = cust.name;
        inv.customerPhone = cust.phone;
      }
    }

    const subtotal = roundMoney(inv.items.reduce((s, it) => s + it.lineTotal, 0));
    const nextDiscount = roundMoney(
      typeof discountTotal === 'number'
        ? Math.max(0, Math.min(subtotal, discountTotal))
        : inv.discountTotal
    );
    const nextTaxRate = typeof taxRate === 'number' ? Math.max(0, taxRate) : inv.taxRate;
    const taxable = Math.max(0, subtotal - nextDiscount);
    const taxAmount = roundMoney((taxable * nextTaxRate) / 100);
    const grandTotal = roundMoney(taxable + taxAmount);

    inv.subtotal = subtotal;
    inv.discountTotal = nextDiscount;
    inv.taxRate = nextTaxRate;
    inv.taxAmount = taxAmount;
    inv.grandTotal = grandTotal;
    inv.balanceDue = roundMoney(Math.max(0, grandTotal - inv.amountPaid));
    if (inv.enabled) {
      inv.paymentStatus =
        inv.balanceDue <= 0.005 ? 'PAID' : inv.amountPaid > 0 ? 'PARTIAL' : 'UNPAID';
    }
    if (dueDate !== undefined) inv.dueDate = dueDate;
    if (invoiceTheme) inv.invoiceTheme = invoiceTheme;
    if (invoiceLayout) inv.invoiceLayout = invoiceLayout;
    if (notes !== undefined) inv.notes = notes;
    inv.updatedAt = new Date().toISOString();

    recalculateCustomerDebts(db);
    addAudit(
      db,
      user,
      inv.branchName,
      'Invoice Edited',
      `Updated ${inv.invoiceNumber} (${inv.customerName}) · Grand Total ${db.settings.currencySymbol}${inv.grandTotal.toFixed(2)}`
    );
    saveDatabase(db);
    res.json({ invoice: inv, db });
  });

  // --- Enable / Disable (Void) Invoice ---
  app.post('/api/invoices/:id/toggle', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'invoices.toggle');
    if (!user) return;

    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (inv.enabled) {
      // Disabling -> restore stock
      for (const item of inv.items) {
        const med = db.medicines.find((m) => m.id === item.medicineId);
        if (med && med.branchStock[inv.branchId]) {
          med.branchStock[inv.branchId].quantity += item.quantity;
        }
      }
      inv.enabled = false;
      inv.paymentStatus = 'VOID';
    } else {
      // Re-enabling -> verify and deduct stock
      for (const item of inv.items) {
        const med = db.medicines.find((m) => m.id === item.medicineId);
        const lot = med?.branchStock[inv.branchId];
        if (!lot || lot.quantity < item.quantity) {
          res.status(400).json({
            error: `Cannot re-enable invoice: insufficient stock for ${item.name} at ${inv.branchName}.`,
          });
          return;
        }
      }
      for (const item of inv.items) {
        const med = db.medicines.find((m) => m.id === item.medicineId)!;
        med.branchStock[inv.branchId].quantity -= item.quantity;
      }
      inv.enabled = true;
      inv.paymentStatus =
        inv.balanceDue <= 0.005 ? 'PAID' : inv.amountPaid > 0 ? 'PARTIAL' : 'UNPAID';
    }
    inv.updatedAt = new Date().toISOString();

    recalculateCustomerDebts(db);
    addAudit(
      db,
      user,
      inv.branchName,
      inv.enabled ? 'Invoice Enabled' : 'Invoice Disabled',
      `${inv.enabled ? 'Restored' : 'Disabled/Voided'} ${inv.invoiceNumber}`
    );
    saveDatabase(db);
    res.json({ invoice: inv, db });
  });

  // --- Record Full or Partial Payment on a Specific Invoice ---
  app.post('/api/invoices/:id/payments', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'debt.collect');
    if (!user) return;

    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv || !inv.enabled) {
      res.status(404).json({ error: 'Active invoice not found.' });
      return;
    }

    const { amount, method = 'Cash', note = '' } = req.body as {
      amount: number;
      method?: PaymentMethod;
      note?: string;
    };

    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      return;
    }

    const applied = roundMoney(Math.min(inv.balanceDue, amount));
    if (applied <= 0) {
      res.status(400).json({ error: 'Invoice is already paid in full.' });
      return;
    }

    const nowIso = new Date().toISOString();
    inv.amountPaid = roundMoney(inv.amountPaid + applied);
    inv.balanceDue = roundMoney(Math.max(0, inv.grandTotal - inv.amountPaid));
    inv.paymentStatus = inv.balanceDue <= 0.005 ? 'PAID' : 'PARTIAL';
    inv.updatedAt = nowIso;
    inv.paymentHistory.push({
      id: `pay-${Date.now()}`,
      date: nowIso,
      amount: applied,
      method,
      note: note || (inv.paymentStatus === 'PAID' ? 'Final settlement' : 'Partial debt repayment'),
      recordedBy: user.name,
    });

    const cust = db.customers.find((c) => c.id === inv.customerId);
    if (cust) cust.lastTransactionAt = nowIso;

    recalculateCustomerDebts(db);
    addAudit(
      db,
      user,
      inv.branchName,
      inv.paymentStatus === 'PAID' ? 'Debt Paid in Full' : 'Partial Payment Collected',
      `Collected ${db.settings.currencySymbol}${applied.toFixed(2)} on ${inv.invoiceNumber} (${inv.customerName}) · Remaining: ${db.settings.currencySymbol}${inv.balanceDue.toFixed(2)}`
    );
    saveDatabase(db);
    res.json({ invoice: inv, db });
  });

  // --- Customer-Level Debt Settlement (FIFO across unpaid/partial invoices) ---
  app.post('/api/customers/:id/pay-debt', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'debt.collect');
    if (!user) return;

    const customer = db.customers.find((c) => c.id === req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const { amount, method = 'Cash', note = '' } = req.body as {
      amount: number;
      method?: PaymentMethod;
      note?: string;
    };

    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      return;
    }

    const openInvoices = db.invoices
      .filter(
        (inv) =>
          inv.customerId === customer.id &&
          inv.enabled &&
          inv.paymentStatus !== 'VOID' &&
          inv.balanceDue > 0.005
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let remainingPayment = roundMoney(amount);
    const nowIso = new Date().toISOString();
    let totalApplied = 0;

    for (const inv of openInvoices) {
      if (remainingPayment <= 0.005) break;
      const take = roundMoney(Math.min(inv.balanceDue, remainingPayment));
      inv.amountPaid = roundMoney(inv.amountPaid + take);
      inv.balanceDue = roundMoney(Math.max(0, inv.grandTotal - inv.amountPaid));
      inv.paymentStatus = inv.balanceDue <= 0.005 ? 'PAID' : 'PARTIAL';
      inv.updatedAt = nowIso;
      inv.paymentHistory.push({
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        date: nowIso,
        amount: take,
        method,
        note:
          note ||
          (inv.paymentStatus === 'PAID'
            ? 'Settled via customer debt ledger'
            : 'Partial settlement via customer debt ledger'),
        recordedBy: user.name,
      });
      remainingPayment = roundMoney(remainingPayment - take);
      totalApplied = roundMoney(totalApplied + take);
    }

    customer.lastTransactionAt = nowIso;
    recalculateCustomerDebts(db);
    addAudit(
      db,
      user,
      'All Branches',
      'Customer Debt Payment',
      `Applied ${db.settings.currencySymbol}${totalApplied.toFixed(2)} for ${customer.name} via ${method}. New debt balance: ${db.settings.currencySymbol}${customer.currentDebt.toFixed(2)}`
    );
    saveDatabase(db);
    res.json({ totalApplied, customer, db });
  });

  // --- Customers CRUD & Enable/Disable ---
  app.post('/api/customers', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'pos.sell');
    if (!user) return;

    const payload = req.body as Partial<Customer>;
    if (!payload.name?.trim()) {
      res.status(400).json({ error: 'Customer name is required.' });
      return;
    }

    const customer: Customer = {
      id: `cust-${Date.now()}`,
      name: payload.name.trim(),
      phone: payload.phone?.trim() || '',
      email: payload.email?.trim() || '',
      address: payload.address?.trim() || '',
      type: payload.type || 'Patient',
      creditLimit: Number(payload.creditLimit ?? 250),
      currentDebt: 0,
      enabled: true,
      notes: payload.notes?.trim() || '',
    };
    db.customers.push(customer);
    addAudit(db, user, 'All Branches', 'Customer Added', `Created account for ${customer.name}`);
    saveDatabase(db);
    res.status(201).json({ customer, db });
  });

  app.put('/api/customers/:id', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'pos.sell');
    if (!user) return;

    const cust = db.customers.find((c) => c.id === req.params.id);
    if (!cust) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const payload = req.body as Partial<Customer>;
    if (payload.name !== undefined) cust.name = payload.name.trim();
    if (payload.phone !== undefined) cust.phone = payload.phone.trim();
    if (payload.email !== undefined) cust.email = payload.email.trim();
    if (payload.address !== undefined) cust.address = payload.address.trim();
    if (payload.type !== undefined) cust.type = payload.type;
    if (payload.creditLimit !== undefined) cust.creditLimit = Math.max(0, Number(payload.creditLimit));
    if (payload.notes !== undefined) cust.notes = payload.notes;
    if (payload.enabled !== undefined) cust.enabled = Boolean(payload.enabled);

    saveDatabase(db);
    res.json({ customer: cust, db });
  });

  // --- Medicines CRUD & Enable/Disable ---
  app.post('/api/medicines', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'inventory.edit');
    if (!user) return;

    const payload = req.body as Partial<Medicine>;
    if (!payload.name?.trim()) {
      res.status(400).json({ error: 'Medicine name is required.' });
      return;
    }

    const branchStock: Medicine['branchStock'] = {};
    for (const b of db.branches) {
      const provided = payload.branchStock?.[b.id];
      branchStock[b.id] = {
        quantity: Number(provided?.quantity ?? 0),
        reorderLevel: Number(provided?.reorderLevel ?? 15),
        batchNumber: provided?.batchNumber || `BCH-${Math.floor(100 + Math.random() * 899)}`,
        expiryDate: provided?.expiryDate || '2027-12-31',
      };
    }

    const med: Medicine = {
      id: `med-${Date.now()}`,
      name: payload.name.trim(),
      genericName: payload.genericName?.trim() || payload.name.trim(),
      sku: payload.sku?.trim() || `RX-${Date.now().toString().slice(-5)}`,
      category: payload.category || 'General',
      dosageForm: payload.dosageForm || 'Tablet',
      strength: payload.strength || '500mg',
      unit: payload.unit || 'Box',
      requiresRx: Boolean(payload.requiresRx),
      activeIngredient: payload.activeIngredient || payload.genericName || payload.name.trim(),
      clinicalNotes: payload.clinicalNotes || '',
      costPrice: roundMoney(Number(payload.costPrice ?? 0)),
      sellingPrice: roundMoney(Number(payload.sellingPrice ?? 0)),
      enabled: true,
      branchStock,
    };

    db.medicines.unshift(med);
    addAudit(db, user, 'All Branches', 'Medicine Added', `Added ${med.name} (${med.strength})`);
    saveDatabase(db);
    res.status(201).json({ medicine: med, db });
  });

  app.put('/api/medicines/:id', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'inventory.edit');
    if (!user) return;

    const med = db.medicines.find((m) => m.id === req.params.id);
    if (!med) {
      res.status(404).json({ error: 'Medicine not found.' });
      return;
    }

    const payload = req.body as Partial<Medicine>;
    if (payload.name !== undefined) med.name = payload.name.trim();
    if (payload.genericName !== undefined) med.genericName = payload.genericName.trim();
    if (payload.sku !== undefined) med.sku = payload.sku.trim();
    if (payload.category !== undefined) med.category = payload.category;
    if (payload.dosageForm !== undefined) med.dosageForm = payload.dosageForm;
    if (payload.strength !== undefined) med.strength = payload.strength;
    if (payload.unit !== undefined) med.unit = payload.unit;
    if (payload.requiresRx !== undefined) med.requiresRx = Boolean(payload.requiresRx);
    if (payload.activeIngredient !== undefined) med.activeIngredient = payload.activeIngredient;
    if (payload.clinicalNotes !== undefined) med.clinicalNotes = payload.clinicalNotes;
    if (payload.costPrice !== undefined) med.costPrice = roundMoney(Number(payload.costPrice));
    if (payload.sellingPrice !== undefined) med.sellingPrice = roundMoney(Number(payload.sellingPrice));
    if (payload.enabled !== undefined) med.enabled = Boolean(payload.enabled);
    if (payload.branchStock) {
      med.branchStock = { ...med.branchStock, ...payload.branchStock };
    }

    addAudit(db, user, 'All Branches', 'Medicine Updated', `Edited ${med.name} (${med.strength})`);
    saveDatabase(db);
    res.json({ medicine: med, db });
  });

  app.post('/api/medicines/:id/toggle', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'inventory.edit');
    if (!user) return;

    const med = db.medicines.find((m) => m.id === req.params.id);
    if (!med) {
      res.status(404).json({ error: 'Medicine not found.' });
      return;
    }
    med.enabled = !med.enabled;
    addAudit(
      db,
      user,
      'All Branches',
      med.enabled ? 'Medicine Enabled' : 'Medicine Disabled',
      `${med.enabled ? 'Enabled' : 'Disabled'} ${med.name}`
    );
    saveDatabase(db);
    res.json({ medicine: med, db });
  });

  // --- Inter-Branch Stock Transfers ---
  app.post('/api/transfers', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'inventory.transfer');
    if (!user) return;

    const { fromBranchId, toBranchId, medicineId, quantity, notes = '' } = req.body as {
      fromBranchId: string;
      toBranchId: string;
      medicineId: string;
      quantity: number;
      notes?: string;
    };

    if (fromBranchId === toBranchId) {
      res.status(400).json({ error: 'Source and destination branches must differ.' });
      return;
    }

    const fromB = db.branches.find((b) => b.id === fromBranchId && b.enabled);
    const toB = db.branches.find((b) => b.id === toBranchId && b.enabled);
    const med = db.medicines.find((m) => m.id === medicineId);
    if (!fromB || !toB || !med) {
      res.status(400).json({ error: 'Invalid branch or medicine.' });
      return;
    }

    const qty = Math.max(1, Math.floor(Number(quantity)));
    const sourceLot = med.branchStock[fromB.id];
    if (!sourceLot || sourceLot.quantity < qty) {
      res.status(400).json({
        error: `Insufficient stock in ${fromB.name} (Available: ${sourceLot?.quantity ?? 0}).`,
      });
      return;
    }

    sourceLot.quantity -= qty;
    if (!med.branchStock[toB.id]) {
      med.branchStock[toB.id] = {
        quantity: qty,
        reorderLevel: sourceLot.reorderLevel,
        batchNumber: sourceLot.batchNumber,
        expiryDate: sourceLot.expiryDate,
      };
    } else {
      med.branchStock[toB.id].quantity += qty;
    }

    const transfer = {
      id: `tr-${Date.now()}`,
      reference: `TRF-${new Date().getFullYear()}-${String(db.transfers.length + 20).padStart(3, '0')}`,
      fromBranchId: fromB.id,
      fromBranchName: fromB.name,
      toBranchId: toB.id,
      toBranchName: toB.name,
      medicineId: med.id,
      medicineName: `${med.name} ${med.strength}`,
      quantity: qty,
      batchNumber: sourceLot.batchNumber,
      status: 'COMPLETED' as const,
      createdAt: new Date().toISOString(),
      initiatedBy: user.name,
      notes,
    };
    db.transfers.unshift(transfer);
    addAudit(
      db,
      user,
      fromB.name,
      'Branch Stock Transfer',
      `Transferred ${qty} × ${med.name} from ${fromB.name} to ${toB.name}`
    );
    saveDatabase(db);
    res.status(201).json({ transfer, db });
  });

  // --- Multi-Branch CRUD & Enable/Disable ---
  app.post('/api/branches', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'branches.manage');
    if (!user) return;

    const payload = req.body as Partial<Branch>;
    if (!payload.name?.trim()) {
      res.status(400).json({ error: 'Branch name is required.' });
      return;
    }

    const branch: Branch = {
      id: `br-${Date.now()}`,
      name: payload.name.trim(),
      code: payload.code?.trim() || `BR-${db.branches.length + 1}`,
      address: payload.address?.trim() || '',
      phone: payload.phone?.trim() || '',
      email: payload.email?.trim() || '',
      managerName: payload.managerName?.trim() || 'Unassigned',
      enabled: true,
      isPrimary: false,
      openingHours: payload.openingHours?.trim() || '08:00 – 20:00',
    };
    db.branches.push(branch);

    // Initialize stock entries for existing medicines
    for (const med of db.medicines) {
      if (!med.branchStock[branch.id]) {
        med.branchStock[branch.id] = {
          quantity: 0,
          reorderLevel: 15,
          batchNumber: 'NEW-LOT',
          expiryDate: '2027-12-31',
        };
      }
    }

    addAudit(db, user, branch.name, 'Branch Created', `Added branch ${branch.name} (${branch.code})`);
    saveDatabase(db);
    res.status(201).json({ branch, db });
  });

  app.put('/api/branches/:id', (req, res) => {
    const db = loadDatabase();
    const user = requirePermission(db, req, res, 'branches.manage');
    if (!user) return;

    const branch = db.branches.find((b) => b.id === req.params.id);
    if (!branch) {
      res.status(404).json({ error: 'Branch not found.' });
      return;
    }

    const payload = req.body as Partial<Branch>;
    if (payload.name !== undefined) branch.name = payload.name.trim();
    if (payload.code !== undefined) branch.code = payload.code.trim();
    if (payload.address !== undefined) branch.address = payload.address.trim();
    if (payload.phone !== undefined) branch.phone = payload.phone.trim();
    if (payload.email !== undefined) branch.email = payload.email.trim();
    if (payload.managerName !== undefined) branch.managerName = payload.managerName.trim();
    if (payload.openingHours !== undefined) branch.openingHours = payload.openingHours.trim();
    if (payload.enabled !== undefined) {
      if (branch.isPrimary && !payload.enabled) {
        res.status(400).json({ error: 'Primary branch cannot be disabled.' });
        return;
      }
      branch.enabled = Boolean(payload.enabled);
    }

    addAudit(db, user, branch.name, 'Branch Updated', `Edited ${branch.name}`);
    saveDatabase(db);
    res.json({ branch, db });
  });

  // --- Staff Access Control & RBAC ---
  app.post('/api/users', (req, res) => {
    const db = loadDatabase();
    const acting = requirePermission(db, req, res, 'users.manage');
    if (!acting) return;

    const payload = req.body as Partial<StaffUser> & { role?: StaffRole };
    if (!payload.name?.trim() || !payload.role) {
      res.status(400).json({ error: 'Staff name and role are required.' });
      return;
    }

    const newUser: StaffUser = {
      id: `usr-${Date.now()}`,
      name: payload.name.trim(),
      email: payload.email?.trim() || `${payload.name.toLowerCase().replace(/\s+/g, '.')}@botanicarx.com`,
      role: payload.role,
      branchId: payload.branchId || db.branches[0].id,
      pin: payload.pin || '1234',
      enabled: true,
      permissions: payload.permissions || { ...ROLE_TEMPLATES[payload.role] },
    };
    db.users.push(newUser);
    addAudit(db, acting, 'All Branches', 'Staff Added', `Created ${newUser.name} (${newUser.role})`);
    saveDatabase(db);
    res.status(201).json({ user: newUser, db });
  });

  app.put('/api/users/:id', (req, res) => {
    const db = loadDatabase();
    const acting = requirePermission(db, req, res, 'users.manage');
    if (!acting) return;

    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Staff user not found.' });
      return;
    }

    const payload = req.body as Partial<StaffUser>;
    if (payload.name !== undefined) target.name = payload.name.trim();
    if (payload.email !== undefined) target.email = payload.email.trim();
    if (payload.role !== undefined) target.role = payload.role;
    if (payload.branchId !== undefined) target.branchId = payload.branchId;
    if (payload.pin !== undefined) target.pin = payload.pin;
    if (payload.enabled !== undefined) {
      if (target.id === acting.id && !payload.enabled) {
        res.status(400).json({ error: 'You cannot disable your own active session.' });
        return;
      }
      target.enabled = Boolean(payload.enabled);
    }
    if (payload.permissions) {
      target.permissions = { ...target.permissions, ...payload.permissions };
    }

    addAudit(
      db,
      acting,
      'All Branches',
      'Access Control Updated',
      `Updated permissions/profile for ${target.name} (${target.role})`
    );
    saveDatabase(db);
    res.json({ user: target, db });
  });

  // --- Settings ---
  app.put('/api/settings', (req, res) => {
    const db = loadDatabase();
    const acting = requirePermission(db, req, res, 'settings.manage');
    if (!acting) return;

    db.settings = {
      ...db.settings,
      ...req.body,
      enabledModules: {
        ...db.settings.enabledModules,
        ...(req.body?.enabledModules || {}),
      },
    };
    addAudit(db, acting, 'System Settings', 'Settings Updated', 'Updated pharmacy configuration');
    saveDatabase(db);
    res.json({ settings: db.settings, db });
  });

  // --- Gemini AI Decision Endpoints ---
  app.post('/api/ai/clinical-check', async (req, res) => {
    const db = loadDatabase();
    const acting = requirePermission(db, req, res, 'ai.use');
    if (!acting) return;

    try {
      const { items, patientContext } = req.body as {
        items: Array<{
          name: string;
          genericName: string;
          strength: string;
          activeIngredient: string;
          quantity: number;
        }>;
        patientContext?: string;
      };
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Select at least one medicine for clinical review.' });
        return;
      }
      const catalogNames = db.medicines.filter((m) => m.enabled).map((m) => `${m.name} (${m.strength})`);
      const analysis = await runClinicalCheck({
        items,
        patientContext,
        availableCatalogNames: catalogNames,
      });
      res.json(analysis);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI clinical analysis failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/business-insights', async (req, res) => {
    const db = loadDatabase();
    const acting = requirePermission(db, req, res, 'ai.use');
    if (!acting) return;

    try {
      const { branchId = 'ALL' } = req.body as { branchId?: string };
      const insights = await runBusinessInsights(db, branchId);
      res.json(insights);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI business intelligence failed.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/ask', async (req, res) => {
    const db = loadDatabase();
    const acting = requirePermission(db, req, res, 'ai.use');
    if (!acting) return;

    try {
      const { question, branchId } = req.body as { question: string; branchId: string };
      if (!question?.trim()) {
        res.status(400).json({ error: 'Question cannot be empty.' });
        return;
      }
      const answer = await runPharmacyCopilot(db, question.trim(), branchId || db.branches[0].id);
      res.json({ answer });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI copilot request failed.';
      res.status(500).json({ error: message });
    }
  });

  // Vite dev middleware or static production serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build artifacts not found.');
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Botanica Rx server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
