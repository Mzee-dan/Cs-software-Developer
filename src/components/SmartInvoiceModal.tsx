import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  Power,
  Printer,
  X,
  AlertTriangle,
  Clock,
  Ban,
  Palette,
  LayoutTemplate,
} from 'lucide-react';
import type {
  Customer,
  Invoice,
  InvoiceLayout,
  InvoiceTheme,
  Medicine,
  PaymentMethod,
  PharmacySettings,
  StaffUser,
} from '../types';
import { api, formatDateTime, formatMoney, formatShortDate, getPaymentStatusMeta } from '../lib/api';

interface SmartInvoiceModalProps {
  invoice: Invoice;
  settings: PharmacySettings;
  customers: Customer[];
  medicines: Medicine[];
  currentUser: StaffUser;
  onClose: () => void;
  onDatabaseUpdate: (nextInvoice: Invoice, db: any) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const THEME_PALETTES: Record<
  InvoiceTheme,
  {
    name: string;
    headerBg: string;
    accentText: string;
    accentBgSoft: string;
    tableHeadBg: string;
    borderAccent: string;
    swatch: string;
  }
> = {
  emerald: {
    name: 'Clinical Emerald',
    headerBg: 'bg-emerald-800 text-white',
    accentText: 'text-emerald-700',
    accentBgSoft: 'bg-emerald-50 border-emerald-200',
    tableHeadBg: 'bg-emerald-50/80 text-emerald-900',
    borderAccent: 'border-emerald-700',
    swatch: 'bg-emerald-700',
  },
  sapphire: {
    name: 'Royal Sapphire',
    headerBg: 'bg-blue-900 text-white',
    accentText: 'text-blue-700',
    accentBgSoft: 'bg-blue-50 border-blue-200',
    tableHeadBg: 'bg-blue-50/80 text-blue-900',
    borderAccent: 'border-blue-800',
    swatch: 'bg-blue-800',
  },
  slate: {
    name: 'Editorial Slate',
    headerBg: 'bg-slate-900 text-white',
    accentText: 'text-slate-800',
    accentBgSoft: 'bg-slate-100 border-slate-300',
    tableHeadBg: 'bg-slate-100 text-slate-900',
    borderAccent: 'border-slate-900',
    swatch: 'bg-slate-900',
  },
  amber: {
    name: 'Warm Apothecary',
    headerBg: 'bg-amber-900 text-white',
    accentText: 'text-amber-800',
    accentBgSoft: 'bg-amber-50 border-amber-200',
    tableHeadBg: 'bg-amber-50/80 text-amber-950',
    borderAccent: 'border-amber-800',
    swatch: 'bg-amber-800',
  },
};

export const SmartInvoiceModal: React.FC<SmartInvoiceModalProps> = ({
  invoice,
  settings,
  customers,
  medicines,
  currentUser,
  onClose,
  onDatabaseUpdate,
  onNotify,
}) => {
  const [theme, setTheme] = useState<InvoiceTheme>(invoice.invoiceTheme || settings.defaultInvoiceTheme);
  const [layout, setLayout] = useState<InvoiceLayout>(invoice.invoiceLayout || settings.defaultInvoiceLayout);
  const [isEditing, setIsEditing] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  // Payment form state
  const [payAmount, setPayAmount] = useState<string>(invoice.balanceDue.toFixed(2));
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Cash');
  const [payNote, setPayNote] = useState('');

  // Edit form state
  const [editCustomerId, setEditCustomerId] = useState(invoice.customerId);
  const [editDueDate, setEditDueDate] = useState(invoice.dueDate);
  const [editDiscount, setEditDiscount] = useState(String(invoice.discountTotal));
  const [editTaxRate, setEditTaxRate] = useState(String(invoice.taxRate));
  const [editNotes, setEditNotes] = useState(invoice.notes || '');
  const [editItems, setEditItems] = useState(
    invoice.items.map((it) => ({
      medicineId: it.medicineId,
      name: it.name,
      strength: it.strength,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent,
    }))
  );

  const palette = THEME_PALETTES[theme];
  const sym = settings.currencySymbol;
  const statusMeta = getPaymentStatusMeta(invoice.paymentStatus);

  const handleThemeChange = async (nextTheme: InvoiceTheme) => {
    setTheme(nextTheme);
    if (currentUser.permissions['invoices.edit']) {
      try {
        const res = await api.updateInvoice(invoice.id, { invoiceTheme: nextTheme });
        onDatabaseUpdate(res.invoice, res.db);
      } catch {
        // visual preview still works
      }
    }
  };

  const handleLayoutChange = async (nextLayout: InvoiceLayout) => {
    setLayout(nextLayout);
    if (currentUser.permissions['invoices.edit']) {
      try {
        const res = await api.updateInvoice(invoice.id, { invoiceLayout: nextLayout });
        onDatabaseUpdate(res.invoice, res.db);
      } catch {
        // visual preview still works
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.updateInvoice(invoice.id, {
        customerId: editCustomerId,
        dueDate: editDueDate,
        discountTotal: Number(editDiscount) || 0,
        taxRate: Number(editTaxRate) || 0,
        notes: editNotes,
        invoiceTheme: theme,
        invoiceLayout: layout,
        items: editItems.map((it) => ({
          medicineId: it.medicineId,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
          discountPercent: Number(it.discountPercent) || 0,
        })),
      });
      onDatabaseUpdate(res.invoice, res.db);
      setIsEditing(false);
      onNotify(`Invoice ${res.invoice.invoiceNumber} updated and recalculated.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update invoice.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onNotify('Enter a valid payment amount greater than zero.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.recordInvoicePayment(invoice.id, {
        amount: amt,
        method: payMethod,
        note: payNote,
      });
      onDatabaseUpdate(res.invoice, res.db);
      setIsPaying(false);
      setPayAmount(res.invoice.balanceDue.toFixed(2));
      setPayNote('');
      onNotify(
        res.invoice.paymentStatus === 'PAID'
          ? `${res.invoice.invoiceNumber} is now Paid in Full.`
          : `Partial payment recorded. Remaining balance: ${formatMoney(res.invoice.balanceDue, sym)}`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Payment failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleEnabled = async () => {
    setBusy(true);
    try {
      const res = await api.toggleInvoice(invoice.id);
      onDatabaseUpdate(res.invoice, res.db);
      onNotify(
        res.invoice.enabled
          ? `Invoice ${res.invoice.invoiceNumber} re-enabled.`
          : `Invoice ${res.invoice.invoiceNumber} disabled & stock restored.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to toggle invoice.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCopySummary = async () => {
    const lines = [
      `${settings.pharmacyName} — ${invoice.invoiceNumber}`,
      `Branch: ${invoice.branchName}`,
      `Customer: ${invoice.customerName}`,
      `Date: ${formatShortDate(invoice.createdAt)}`,
      ...invoice.items.map(
        (it) => `- ${it.name} ${it.strength} ×${it.quantity}: ${formatMoney(it.lineTotal, sym)}`
      ),
      `Total: ${formatMoney(invoice.grandTotal, sym)}`,
      `Paid: ${formatMoney(invoice.amountPaid, sym)} | Balance Due: ${formatMoney(invoice.balanceDue, sym)} (${statusMeta.label})`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      onNotify('Invoice summary copied to clipboard.', 'success');
    } catch {
      onNotify('Could not copy automatically.', 'error');
    }
  };

  const StatusIcon =
    invoice.paymentStatus === 'PAID'
      ? CheckCircle2
      : invoice.paymentStatus === 'PARTIAL'
      ? Clock
      : invoice.paymentStatus === 'UNPAID'
      ? AlertTriangle
      : Ban;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl border border-slate-200 dark:border-slate-800">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
              {invoice.invoiceNumber}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusMeta.surfaceClass} ${statusMeta.textClass}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusMeta.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Color theme dots */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
              <Palette className="h-3.5 w-3.5 text-slate-500" />
              {(Object.keys(THEME_PALETTES) as InvoiceTheme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  title={THEME_PALETTES[t].name}
                  onClick={() => handleThemeChange(t)}
                  className={`h-5 w-5 rounded-full ${THEME_PALETTES[t].swatch} transition-transform ${
                    theme === t ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            {/* Arrangement Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => handleLayoutChange('detailed')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  layout === 'detailed'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <LayoutTemplate className="h-3.5 w-3.5" />
                A4
              </button>
              <button
                type="button"
                onClick={() => handleLayoutChange('compact')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  layout === 'compact'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                80mm
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/50 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {invoice.enabled && invoice.balanceDue > 0.005 && currentUser.permissions['debt.collect'] && (
              <button
                type="button"
                onClick={() => {
                  setIsPaying((v) => !v);
                  setIsEditing(false);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <CreditCard className="h-4 w-4" />
                Collect Full / Partial Payment
              </button>
            )}

            {currentUser.permissions['invoices.edit'] && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing((v) => !v);
                  setIsPaying(false);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {isEditing ? 'Cancel Edit' : 'Edit Invoice'}
              </button>
            )}

            {currentUser.permissions['invoices.toggle'] && (
              <button
                type="button"
                disabled={busy}
                onClick={handleToggleEnabled}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                  invoice.enabled
                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {invoice.enabled ? 'Disable / Void Invoice' : 'Re-Enable Invoice'}
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Issued by {invoice.cashierName} · {formatDateTime(invoice.createdAt)}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950 sm:p-6">
          {/* Collect Payment Panel */}
          {isPaying && (
            <form
              onSubmit={handleCollectPayment}
              className="mb-5 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Record Payment Toward {invoice.invoiceNumber}
                </h4>
                <span className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Remaining Due: {formatMoney(invoice.balanceDue, sym)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Amount ({sym})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={invoice.balanceDue}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                    required
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPayAmount((invoice.balanceDue / 2).toFixed(2))}
                      className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Pay 50%
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setPayAmount(invoice.balanceDue.toFixed(2))}
                      className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Pay Full Balance
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Reference / Note
                  </label>
                  <input
                    type="text"
                    placeholder="Receipt or transfer ref"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaying(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Apply Payment'}
                </button>
              </div>
            </form>
          )}

          {/* Edit Invoice Panel */}
          {isEditing && (
            <form
              onSubmit={handleSaveEdit}
              className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <h4 className="mb-3 font-display text-sm font-semibold text-slate-900 dark:text-white">
                Edit Invoice Details &amp; Line Items
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Customer
                  </label>
                  <select
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Invoice Discount ({sym})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Tax / VAT (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editTaxRate}
                    onChange={(e) => setEditTaxRate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Line Items (adjust quantity, unit price, or item discount %)
                </div>
                {editItems.map((it, idx) => (
                  <div
                    key={`${it.medicineId}-${idx}`}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <select
                        value={it.medicineId}
                        onChange={(e) => {
                          const med = medicines.find((m) => m.id === e.target.value);
                          if (!med) return;
                          setEditItems((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx
                                ? {
                                    ...row,
                                    medicineId: med.id,
                                    name: med.name,
                                    strength: med.strength,
                                    unitPrice: med.sellingPrice,
                                  }
                                : row
                            )
                          );
                        }}
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        {medicines.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.strength})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          setEditItems((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, quantity: Number(e.target.value) } : row
                            )
                          )
                        }
                        aria-label="Quantity"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={it.unitPrice}
                        onChange={(e) =>
                          setEditItems((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, unitPrice: Number(e.target.value) } : row
                            )
                          )
                        }
                        aria-label="Unit price"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={it.discountPercent}
                        onChange={(e) =>
                          setEditItems((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, discountPercent: Number(e.target.value) } : row
                            )
                          )
                        }
                        aria-label="Discount percent"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      {editItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditItems((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          Del
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Dispensing / Payment Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600"
                >
                  {busy ? 'Saving...' : 'Save Invoice Changes'}
                </button>
              </div>
            </form>
          )}

          {/* SMART INVOICE DOCUMENT */}
          <div
            id="smart-invoice-printable"
            className={`mx-auto bg-white text-slate-900 shadow-sm border border-slate-200 overflow-hidden ${
              layout === 'compact' ? 'max-w-md rounded-xl' : 'w-full rounded-xl'
            }`}
          >
            {/* Header Band */}
            <div className={`${palette.headerBg} px-6 py-5`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white p-1">
                    <img
                      src="/src/assets/images/pharmacy_emblem_1795099259766.jpg"
                      alt={settings.pharmacyName}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-tight">
                      {settings.pharmacyName}
                    </h2>
                    <p className="text-xs opacity-90">
                      {invoice.branchName} · Lic: {settings.licenseNumber}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider opacity-80">Tax Invoice</div>
                  <div className="font-mono text-lg font-bold">{invoice.invoiceNumber}</div>
                  <div className="text-xs opacity-85">{formatShortDate(invoice.createdAt)}</div>
                </div>
              </div>
            </div>

            {/* Meta Grid */}
            <div
              className={`grid gap-4 border-b border-slate-200 px-6 py-4 ${
                layout === 'compact' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'
              }`}
            >
              <div>
                <div className="text-xs font-medium text-slate-500">Billed To</div>
                <div className="mt-0.5 font-semibold text-slate-900">{invoice.customerName}</div>
                <div className="text-xs text-slate-600">{invoice.customerPhone || 'Counter Patient'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Dispensary Details</div>
                <div className="mt-0.5 text-sm font-medium text-slate-800">{invoice.branchName}</div>
                <div className="text-xs text-slate-600">
                  Pharmacist/Cashier: {invoice.cashierName}
                </div>
              </div>
              <div className={layout === 'compact' ? '' : 'sm:text-right'}>
                <div className="text-xs font-medium text-slate-500">Settlement Status</div>
                <div className={`mt-0.5 inline-flex items-center gap-1.5 text-sm font-bold ${statusMeta.textClass}`}>
                  <StatusIcon className="h-4 w-4" />
                  {statusMeta.label}
                </div>
                <div className="text-xs text-slate-600">Due: {formatShortDate(invoice.dueDate)}</div>
              </div>
            </div>

            {/* Items Table */}
            <div className="px-6 py-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className={`${palette.tableHeadBg} text-xs font-semibold`}>
                      <th className="rounded-l-md px-3 py-2">Medicine</th>
                      {layout === 'detailed' && <th className="px-3 py-2">Batch / Exp</th>}
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit</th>
                      {layout === 'detailed' && <th className="px-3 py-2 text-right">Disc</th>}
                      <th className="rounded-r-md px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.items.map((item, idx) => (
                      <tr key={`${item.medicineId}-${idx}`}>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.strength}</div>
                        </td>
                        {layout === 'detailed' && (
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                            {item.batchNumber}
                            {item.expiryDate ? ` · ${item.expiryDate}` : ''}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right font-mono">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatMoney(item.unitPrice, sym)}
                        </td>
                        {layout === 'detailed' && (
                          <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                            {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                          {formatMoney(item.lineTotal, sym)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Payment Ledger Split */}
              <div
                className={`mt-6 grid gap-5 border-t border-slate-200 pt-5 ${
                  layout === 'compact' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                }`}
              >
                {/* Payment History & Notes */}
                <div className={`rounded-lg border p-3.5 ${palette.accentBgSoft}`}>
                  <div className={`text-xs font-semibold ${palette.accentText}`}>
                    Payment &amp; Debt Communication Ledger
                  </div>
                  {invoice.paymentHistory.length === 0 ? (
                    <p className="mt-1.5 text-xs text-slate-600">
                      No upfront payment collected. Full balance recorded under customer credit account.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {invoice.paymentHistory.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-slate-700">
                          <span>
                            {formatShortDate(p.date)} · {p.method}
                          </span>
                          <span className="font-mono font-semibold text-emerald-700">
                            +{formatMoney(p.amount, sym)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {invoice.notes && (
                    <div className="mt-3 border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                      Note: {invoice.notes}
                    </div>
                  )}
                </div>

                {/* Numeric Totals */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatMoney(invoice.subtotal, sym)}</span>
                  </div>
                  {invoice.discountTotal > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount</span>
                      <span className="font-mono">-{formatMoney(invoice.discountTotal, sym)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Tax / VAT ({invoice.taxRate}%)</span>
                    <span className="font-mono">{formatMoney(invoice.taxAmount, sym)}</span>
                  </div>
                  <div className={`flex justify-between border-t-2 ${palette.borderAccent} pt-2 text-base font-bold text-slate-900`}>
                    <span>Grand Total</span>
                    <span className="font-mono">{formatMoney(invoice.grandTotal, sym)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium text-emerald-700">
                    <span>Total Paid</span>
                    <span className="font-mono">{formatMoney(invoice.amountPaid, sym)}</span>
                  </div>
                  <div
                    className={`flex justify-between rounded-md px-2.5 py-1.5 text-sm font-bold ${
                      invoice.balanceDue > 0.005
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    <span>{invoice.balanceDue > 0.005 ? 'Remaining Debt Balance' : 'Balance Due'}</span>
                    <span className="font-mono">{formatMoney(invoice.balanceDue, sym)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-center text-xs text-slate-500">
              {settings.invoiceFooterNote} · {settings.phone} · {settings.email}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
