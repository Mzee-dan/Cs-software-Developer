import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserPlus,
  X,
  Clock,
} from 'lucide-react';
import type {
  ClinicalAIResponse,
  Customer,
  Invoice,
  Medicine,
  PaymentMethod,
  PharmacyDatabase,
  StaffUser,
} from '../types';
import { api, daysUntil, formatMoney } from '../lib/api';

interface CartLine {
  medicine: Medicine;
  quantity: number;
  discountPercent: number;
}

interface PosWorkspaceProps {
  db: PharmacyDatabase;
  activeBranchId: string;
  currentUser: StaffUser;
  onDbUpdate: (db: PharmacyDatabase) => void;
  onOpenInvoice: (inv: Invoice) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

export const PosWorkspace: React.FC<PosWorkspaceProps> = ({
  db,
  activeBranchId,
  currentUser,
  onDbUpdate,
  onOpenInvoice,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    db.customers[0]?.id || 'cust-walkin'
  );
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'PARTIAL' | 'CREDIT'>('FULL');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [partialPaidInput, setPartialPaidInput] = useState<string>('');
  const [overallDiscount, setOverallDiscount] = useState<string>('0');
  const [saleNotes, setSaleNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Mobile cart drawer toggle
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Inline quick debt settlement inside POS
  const [settlingDebt, setSettlingDebt] = useState(false);
  const [debtPayInput, setDebtPayInput] = useState('');
  const [debtPayMethod, setDebtPayMethod] = useState<PaymentMethod>('Cash');

  // Inline quick add customer
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustLimit, setNewCustLimit] = useState('300');

  // AI Clinical Check
  const [patientContext, setPatientContext] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [clinicalResult, setClinicalResult] = useState<ClinicalAIResponse | null>(null);

  const sym = db.settings.currencySymbol;
  const activeBranch = db.branches.find((b) => b.id === activeBranchId);
  const selectedCustomer: Customer | undefined = db.customers.find(
    (c) => c.id === selectedCustomerId
  );

  const categories = useMemo(() => {
    const cats = Array.from(new Set(db.medicines.filter((m) => m.enabled).map((m) => m.category)));
    return ['All', ...cats];
  }, [db.medicines]);

  const filteredMedicines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.medicines.filter((m) => {
      if (!m.enabled) return false;
      if (category !== 'All' && m.category !== category) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });
  }, [db.medicines, search, category]);

  const addToCart = (med: Medicine) => {
    const lot = med.branchStock[activeBranchId];
    const available = lot?.quantity ?? 0;
    if (available <= 0) {
      onNotify(`${med.name} is out of stock at ${activeBranch?.name || 'this branch'}.`, 'error');
      return;
    }
    setClinicalResult(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.medicine.id === med.id);
      if (existing) {
        if (existing.quantity >= available) {
          onNotify(`Maximum branch stock (${available}) reached for ${med.name}.`, 'error');
          return prev;
        }
        return prev.map((l) =>
          l.medicine.id === med.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { medicine: med, quantity: 1, discountPercent: 0 }];
    });
  };

  const updateCartQty = (medId: string, delta: number) => {
    setClinicalResult(null);
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.medicine.id !== medId) return line;
          const maxQty = line.medicine.branchStock[activeBranchId]?.quantity ?? 0;
          const next = line.quantity + delta;
          if (next <= 0) return null;
          if (next > maxQty) {
            onNotify(`Only ${maxQty} units available in this branch.`, 'error');
            return line;
          }
          return { ...line, quantity: next };
        })
        .filter(Boolean) as CartLine[]
    );
  };

  const updateCartLineDiscount = (medId: string, discount: number) => {
    const safe = Math.min(100, Math.max(0, discount));
    setCart((prev) =>
      prev.map((l) => (l.medicine.id === medId ? { ...l, discountPercent: safe } : l))
    );
  };

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, l) => sum + l.medicine.sellingPrice * l.quantity * (1 - l.discountPercent / 100),
        0
      ),
    [cart]
  );

  const extraDiscount = Math.min(subtotal, Math.max(0, Number(overallDiscount) || 0));
  const taxable = Math.max(0, subtotal - extraDiscount);
  const taxAmount = (taxable * db.settings.taxRate) / 100;
  const grandTotal = Math.round((taxable + taxAmount) * 100) / 100;

  const amountPaidNow = useMemo(() => {
    if (paymentMode === 'FULL') return grandTotal;
    if (paymentMode === 'CREDIT') return 0;
    const parsed = Number(partialPaidInput);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(grandTotal, parsed);
  }, [paymentMode, grandTotal, partialPaidInput]);

  const newDebtAdded = Math.max(0, Math.round((grandTotal - amountPaidNow) * 100) / 100);
  const projectedTotalDebt = (selectedCustomer?.currentDebt ?? 0) + newDebtAdded;
  const creditExceeded =
    newDebtAdded > 0 &&
    selectedCustomer &&
    selectedCustomer.id !== 'cust-walkin' &&
    projectedTotalDebt > selectedCustomer.creditLimit;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      onNotify('Add medicines to the cart before completing a sale.', 'error');
      return;
    }
    if (!selectedCustomer) {
      onNotify('Select a customer account.', 'error');
      return;
    }
    if (newDebtAdded > 0 && selectedCustomer.id === 'cust-walkin') {
      onNotify('Walk-In Cash Customer cannot carry debt. Choose or create a named customer.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createInvoice({
        branchId: activeBranchId,
        customerId: selectedCustomer.id,
        items: cart.map((l) => ({
          medicineId: l.medicine.id,
          quantity: l.quantity,
          unitPrice: l.medicine.sellingPrice,
          discountPercent: l.discountPercent,
        })),
        overallDiscountAmount: extraDiscount,
        taxRate: db.settings.taxRate,
        amountPaid: amountPaidNow,
        paymentMethod,
        notes: saleNotes,
      });
      onDbUpdate(res.db);
      setCart([]);
      setOverallDiscount('0');
      setPartialPaidInput('');
      setSaleNotes('');
      setClinicalResult(null);
      setMobileCartOpen(false);
      onNotify(
        res.invoice.paymentStatus === 'PAID'
          ? `Sale completed · ${res.invoice.invoiceNumber} Paid in Full.`
          : `Sale completed · ${res.invoice.invoiceNumber} (${res.invoice.paymentStatus}) updated customer debt.`,
        'success'
      );
      onOpenInvoice(res.invoice);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Checkout failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDebtPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amt = Number(debtPayInput);
    if (!Number.isFinite(amt) || amt <= 0) {
      onNotify('Enter a valid payment amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.payCustomerDebt(selectedCustomer.id, {
        amount: amt,
        method: debtPayMethod,
        note: 'Collected at POS counter',
      });
      onDbUpdate(res.db);
      setSettlingDebt(false);
      setDebtPayInput('');
      onNotify(
        `Applied ${formatMoney(res.totalApplied, sym)} toward ${selectedCustomer.name}'s debt.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Debt payment failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.createCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        type: 'Patient',
        creditLimit: Number(newCustLimit) || 300,
      });
      onDbUpdate(res.db);
      const newest = res.db.customers[res.db.customers.length - 1];
      if (newest) setSelectedCustomerId(newest.id);
      setAddingCustomer(false);
      setNewCustName('');
      setNewCustPhone('');
      onNotify('Customer account created and selected.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not add customer.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunClinicalAI = async () => {
    if (cart.length === 0) {
      onNotify('Add at least one medicine to run AI clinical safety check.', 'error');
      return;
    }
    setAiLoading(true);
    try {
      const res = await api.clinicalCheck({
        items: cart.map((l) => ({
          name: l.medicine.name,
          genericName: l.medicine.genericName,
          strength: l.medicine.strength,
          activeIngredient: l.medicine.activeIngredient,
          quantity: l.quantity,
        })),
        patientContext,
      });
      setClinicalResult(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI clinical check failed.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const cartPanel = (
    <div className="flex h-full flex-col">
      {/* Customer & Live Debt Communicator */}
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Customer &amp; Debt Account
          </label>
          <button
            type="button"
            onClick={() => setAddingCustomer((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            <UserPlus className="h-3.5 w-3.5" />
            New Customer
          </button>
        </div>

        <select
          value={selectedCustomerId}
          onChange={(e) => {
            setSelectedCustomerId(e.target.value);
            setSettlingDebt(false);
            if (e.target.value === 'cust-walkin' && paymentMode !== 'FULL') {
              setPaymentMode('FULL');
            }
          }}
          className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {db.customers
            .filter((c) => c.enabled)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.currentDebt > 0 ? `(Debt: ${formatMoney(c.currentDebt, sym)})` : ''}
              </option>
            ))}
        </select>

        {addingCustomer && (
          <form
            onSubmit={handleQuickAddCustomer}
            className="mt-2.5 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70"
          >
            <input
              type="text"
              placeholder="Patient or clinic name"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Phone number"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Credit limit"
                value={newCustLimit}
                onChange={(e) => setNewCustLimit(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingCustomer(false)}
                className="text-xs text-slate-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Live Debt Status Indicator */}
        {selectedCustomer && selectedCustomer.id !== 'cust-walkin' && (
          <div
            className={`mt-2.5 rounded-lg border p-3 ${
              selectedCustomer.currentDebt > 0
                ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800/70 dark:bg-amber-950/30'
                : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/70 dark:bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                {selectedCustomer.currentDebt > 0 ? (
                  <>
                    <Clock className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                    <span className="text-amber-800 dark:text-amber-300">
                      Active Debt: {formatMoney(selectedCustomer.currentDebt, sym)}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                    <span className="text-emerald-800 dark:text-emerald-300">
                      Account Clear ({formatMoney(0, sym)} debt)
                    </span>
                  </>
                )}
              </div>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                Limit {formatMoney(selectedCustomer.creditLimit, sym)}
              </span>
            </div>

            {selectedCustomer.currentDebt > 0 && currentUser.permissions['debt.collect'] && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-amber-200/70 pt-2 dark:border-amber-800/60">
                <span className="text-xs text-amber-800 dark:text-amber-300">
                  Available Credit:{' '}
                  <strong className="font-mono">
                    {formatMoney(
                      Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentDebt),
                      sym
                    )}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSettlingDebt((v) => !v);
                    setDebtPayInput(selectedCustomer.currentDebt.toFixed(2));
                  }}
                  className="rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  {settlingDebt ? 'Close' : 'Pay Past Debt'}
                </button>
              </div>
            )}

            {settlingDebt && (
              <form onSubmit={handleQuickDebtPay} className="mt-2.5 space-y-2 border-t border-amber-200 pt-2.5 dark:border-amber-800">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedCustomer.currentDebt}
                    value={debtPayInput}
                    onChange={(e) => setDebtPayInput(e.target.value)}
                    placeholder="Amount"
                    className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-amber-700 dark:bg-slate-900"
                    required
                  />
                  <select
                    value={debtPayMethod}
                    onChange={(e) => setDebtPayMethod(e.target.value as PaymentMethod)}
                    className="rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs dark:border-amber-700 dark:bg-slate-900"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setDebtPayInput((selectedCustomer.currentDebt / 2).toFixed(2))}
                    className="text-xs font-medium text-amber-800 hover:underline dark:text-amber-300"
                  >
                    Partial 50%
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Confirm Debt Payment
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-center dark:border-slate-700">
            <ShoppingBag className="h-7 w-7 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              Cart is empty
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Tap any medicine to dispense from {activeBranch?.name}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {cart.map((line) => (
              <div
                key={line.medicine.id}
                className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {line.medicine.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {line.medicine.strength} · {formatMoney(line.medicine.sellingPrice, sym)} / unit
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateCartQty(line.medicine.id, -line.quantity)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                    aria-label={`Remove ${line.medicine.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateCartQty(line.medicine.id, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center font-mono text-sm font-semibold">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(line.medicine.id, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {currentUser.permissions['pos.discount'] && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">Disc%</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={line.discountPercent}
                        onChange={(e) =>
                          updateCartLineDiscount(line.medicine.id, Number(e.target.value))
                        }
                        className="w-14 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  )}

                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                    {formatMoney(
                      line.medicine.sellingPrice *
                        line.quantity *
                        (1 - line.discountPercent / 100),
                      sym
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* AI Clinical Cart Check */}
            {db.settings.enabledModules.aiAdvisor && currentUser.permissions['ai.use'] && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    AI Clinical Decision Check
                  </span>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={handleRunClinicalAI}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiLoading ? 'Checking...' : 'Check Safety'}
                  </button>
                </div>
                <input
                  type="text"
                  value={patientContext}
                  onChange={(e) => setPatientContext(e.target.value)}
                  placeholder="Optional: patient age, pregnancy, allergies..."
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />

                {clinicalResult && (
                  <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5 text-xs dark:border-slate-700">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <ShieldAlert
                        className={`h-4 w-4 ${
                          clinicalResult.overallRisk === 'HIGH'
                            ? 'text-rose-600'
                            : clinicalResult.overallRisk === 'MODERATE'
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      />
                      <span>Clinical Risk: {clinicalResult.overallRisk}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{clinicalResult.summary}</p>
                    {clinicalResult.interactions.map((inter, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        <div className="font-semibold">
                          {inter.pair} ({inter.severity})
                        </div>
                        <div className="mt-0.5">{inter.explanation}</div>
                        <div className="mt-0.5 font-medium">Action: {inter.recommendation}</div>
                      </div>
                    ))}
                    {clinicalResult.counselingPoints.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-300">
                        {clinicalResult.counselingPoints.slice(0, 3).map((pt, idx) => (
                          <li key={idx}>{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Checkout & Payment Mode Footer */}
      <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Subtotal</span>
            <span className="font-mono">{formatMoney(subtotal, sym)}</span>
          </div>
          {currentUser.permissions['pos.discount'] && (
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Invoice Discount ({sym})</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(e.target.value)}
                className="w-20 rounded border border-slate-300 bg-white px-2 py-0.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          )}
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Tax ({db.settings.taxRate}%)</span>
            <span className="font-mono">{formatMoney(taxAmount, sym)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
            <span>Grand Total</span>
            <span className="font-mono">{formatMoney(grandTotal, sym)}</span>
          </div>
        </div>

        {/* Payment Mode Selector */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setPaymentMode('FULL')}
            className={`min-h-[36px] rounded-md px-2 text-xs font-semibold transition-colors ${
              paymentMode === 'FULL'
                ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Pay Full
          </button>
          <button
            type="button"
            disabled={!db.settings.allowCreditSales || !currentUser.permissions['pos.credit_sale']}
            onClick={() => {
              setPaymentMode('PARTIAL');
              if (!partialPaidInput) setPartialPaidInput((grandTotal / 2).toFixed(2));
            }}
            className={`min-h-[36px] rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
              paymentMode === 'PARTIAL'
                ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-700 dark:text-amber-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Partial + Debt
          </button>
          <button
            type="button"
            disabled={!db.settings.allowCreditSales || !currentUser.permissions['pos.credit_sale']}
            onClick={() => setPaymentMode('CREDIT')}
            className={`min-h-[36px] rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
              paymentMode === 'CREDIT'
                ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-700 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Full Credit
          </button>
        </div>

        {paymentMode !== 'CREDIT' && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
            {paymentMode === 'PARTIAL' ? (
              <input
                type="number"
                step="0.01"
                min="0"
                max={grandTotal}
                value={partialPaidInput}
                onChange={(e) => setPartialPaidInput(e.target.value)}
                placeholder="Paid now"
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-amber-700 dark:bg-slate-800"
              />
            ) : (
              <input
                type="text"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Optional note"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            )}
          </div>
        )}

        {newDebtAdded > 0 && (
          <div
            className={`mt-2.5 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
              creditExceeded
                ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            }`}
          >
            <span>
              {creditExceeded ? 'Credit Limit Exceeded!' : 'Added to Debt Ledger:'}
            </span>
            <span className="font-mono font-bold">{formatMoney(newDebtAdded, sym)}</span>
          </div>
        )}

        <button
          type="button"
          disabled={submitting || cart.length === 0 || Boolean(creditExceeded)}
          onClick={handleCheckout}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CreditCard className="h-4 w-4" />
          {submitting
            ? 'Processing Sale...'
            : paymentMode === 'FULL'
            ? `Complete Sale · ${formatMoney(grandTotal, sym)}`
            : paymentMode === 'PARTIAL'
            ? `Pay ${formatMoney(amountPaidNow, sym)} & Debt ${formatMoney(newDebtAdded, sym)}`
            : `Record Credit Sale · ${formatMoney(grandTotal, sym)}`}
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_420px]">
      {/* Left Catalog Pane */}
      <div className="space-y-4">
        {/* Search & Category Controls */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine name, generic, SKU, or category..."
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  category === cat
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Medicine Grid */}
        {filteredMedicines.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No active medicines match "{search}".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredMedicines.map((med) => {
              const lot = med.branchStock[activeBranchId] || {
                quantity: 0,
                reorderLevel: 10,
                batchNumber: 'N/A',
                expiryDate: '2027-12-31',
              };
              const inCart = cart.find((c) => c.medicine.id === med.id)?.quantity ?? 0;
              const isLow = lot.quantity > 0 && lot.quantity <= lot.reorderLevel;
              const isOut = lot.quantity <= 0;
              const expDays = daysUntil(lot.expiryDate);

              return (
                <button
                  key={med.id}
                  type="button"
                  disabled={isOut}
                  onClick={() => addToCart(med)}
                  className={`group flex min-h-[128px] flex-col justify-between rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                    isOut
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                      : inCart > 0
                      ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 dark:border-emerald-600 dark:bg-emerald-950/20'
                      : 'border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {med.category} · {med.requiresRx ? 'Rx Required' : 'OTC'}
                      </span>
                      {inCart > 0 && (
                        <span className="rounded-md bg-emerald-700 px-2 py-0.5 font-mono text-xs font-bold text-white">
                          ×{inCart}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-display text-sm font-semibold text-slate-900 dark:text-white">
                      {med.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {med.strength} · {med.unit}
                    </p>
                  </div>

                  <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <div className="text-xs">
                      {isOut ? (
                        <span className="font-medium text-rose-600">Out of stock</span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          {lot.quantity} left
                        </span>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-400">
                          {lot.quantity} in stock
                        </span>
                      )}
                      {expDays <= db.settings.expiryWarningDays && !isOut && (
                        <span className="ml-2 text-rose-600">· Exp {lot.expiryDate}</span>
                      )}
                    </div>
                    <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                      {formatMoney(med.sellingPrice, sym)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop Sticky Cart Column */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 flex max-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {cartPanel}
        </div>
      </aside>

      {/* Mobile Floating Checkout Trigger above Bottom Nav */}
      <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="flex min-h-[44px] w-full items-center justify-between rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Cart ({cart.reduce((s, l) => s + l.quantity, 0)} items)
            {selectedCustomer && selectedCustomer.currentDebt > 0 && (
              <span className="text-xs font-normal text-amber-200">
                · Debt {formatMoney(selectedCustomer.currentDebt, sym)}
              </span>
            )}
          </span>
          <span className="font-mono">{formatMoney(grandTotal, sym)} · Checkout</span>
        </button>
      </div>

      {/* Mobile Bottom Sheet Cart */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 backdrop-blur-sm lg:hidden">
          <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="absolute right-4 top-2.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{cartPanel}</div>
          </div>
        </div>
      )}
    </div>
  );
};
