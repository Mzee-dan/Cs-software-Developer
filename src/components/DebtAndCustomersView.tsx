import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileText,
  Plus,
  Power,
  Search,
  AlertTriangle,
} from 'lucide-react';
import type {
  Customer,
  Invoice,
  PaymentMethod,
  PharmacyDatabase,
  StaffUser,
} from '../types';
import { api, formatMoney, formatShortDate, getPaymentStatusMeta } from '../lib/api';

interface DebtAndCustomersViewProps {
  db: PharmacyDatabase;
  currentUser: StaffUser;
  onDbUpdate: (db: PharmacyDatabase) => void;
  onOpenInvoice: (inv: Invoice) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

export const DebtAndCustomersView: React.FC<DebtAndCustomersViewProps> = ({
  db,
  currentUser,
  onDbUpdate,
  onOpenInvoice,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'DEBT' | 'CLEAR' | 'DISABLED'>('ALL');
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Cash');
  const [payNote, setPayNote] = useState('');

  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [busy, setBusy] = useState(false);

  const sym = db.settings.currencySymbol;

  const stats = useMemo(() => {
    const active = db.customers.filter((c) => c.id !== 'cust-walkin' && c.enabled);
    const totalDebt = active.reduce((s, c) => s + c.currentDebt, 0);
    const debtors = active.filter((c) => c.currentDebt > 0).length;
    const openInvoices = db.invoices.filter(
      (i) => i.enabled && (i.paymentStatus === 'PARTIAL' || i.paymentStatus === 'UNPAID')
    ).length;
    const totalLimit = active.reduce((s, c) => s + c.creditLimit, 0);
    return { totalDebt, debtors, openInvoices, totalLimit };
  }, [db.customers, db.invoices]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.customers.filter((c) => {
      if (c.id === 'cust-walkin') return false;
      if (filter === 'DEBT' && (!c.enabled || c.currentDebt <= 0)) return false;
      if (filter === 'CLEAR' && (!c.enabled || c.currentDebt > 0)) return false;
      if (filter === 'DISABLED' && c.enabled) return false;
      if (filter === 'ALL' && !c.enabled) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q)
      );
    });
  }, [db.customers, search, filter]);

  const handlePayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCustomer) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onNotify('Enter a valid amount greater than zero.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.payCustomerDebt(payingCustomer.id, {
        amount: amt,
        method: payMethod,
        note: payNote,
      });
      onDbUpdate(res.db);
      const updated = res.db.customers.find((c) => c.id === payingCustomer.id);
      onNotify(
        updated && updated.currentDebt <= 0.005
          ? `${payingCustomer.name}'s debt is now Paid in Full.`
          : `Partial payment of ${formatMoney(res.totalApplied, sym)} applied. Remaining debt: ${formatMoney(updated?.currentDebt ?? 0, sym)}`,
        'success'
      );
      setPayingCustomer(null);
      setPayAmount('');
      setPayNote('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Payment failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer?.name?.trim()) return;
    setBusy(true);
    try {
      if (editingCustomer.id) {
        const res = await api.updateCustomer(editingCustomer.id, editingCustomer);
        onDbUpdate(res.db);
        onNotify('Customer profile updated.', 'success');
      } else {
        const res = await api.createCustomer(editingCustomer);
        onDbUpdate(res.db);
        onNotify('Customer account created.', 'success');
      }
      setEditingCustomer(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not save customer.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCustomer = async (cust: Customer) => {
    setBusy(true);
    try {
      const res = await api.updateCustomer(cust.id, { enabled: !cust.enabled });
      onDbUpdate(res.db);
      onNotify(
        cust.enabled ? `${cust.name} disabled.` : `${cust.name} re-enabled.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Outstanding Receivables</div>
          <div className="mt-1 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
            {formatMoney(stats.totalDebt, sym)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Across {stats.debtors} active accounts</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Open Credit Invoices</div>
          <div className="mt-1 font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
            {stats.openInvoices}
          </div>
          <div className="mt-1 text-xs text-slate-500">Unpaid or partial settlement</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Total Credit Capacity</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(stats.totalLimit, sym)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Authorized clinic &amp; patient limits</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Credit Utilization</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {stats.totalLimit > 0 ? Math.round((stats.totalDebt / stats.totalLimit) * 100) : 0}%
          </div>
          <div className="mt-1 text-xs text-slate-500">Healthy threshold &lt; 65%</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or phone..."
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['ALL', 'Active'],
                ['DEBT', 'With Debt'],
                ['CLEAR', 'Clear'],
                ['DISABLED', 'Disabled'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setEditingCustomer({
              name: '',
              phone: '',
              email: '',
              address: '',
              type: 'Patient',
              creditLimit: 300,
              notes: '',
            })
          }
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" />
          Add Customer Account
        </button>
      </div>

      {/* Customer & Debt Cards */}
      {filteredCustomers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          No customer accounts match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredCustomers.map((cust) => {
            const custInvoices = db.invoices.filter(
              (inv) =>
                inv.customerId === cust.id &&
                inv.enabled &&
                (inv.paymentStatus === 'PARTIAL' || inv.paymentStatus === 'UNPAID')
            );
            const pct =
              cust.creditLimit > 0
                ? Math.min(100, Math.round((cust.currentDebt / cust.creditLimit) * 100))
                : 0;

            return (
              <div
                key={cust.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">
                        {cust.type} · {cust.phone || 'No phone'}
                      </div>
                      <h3 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                        {cust.name}
                      </h3>
                    </div>

                    {cust.currentDebt > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Owes {formatMoney(cust.currentDebt, sym)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Settled
                      </span>
                    )}
                  </div>

                  {/* Credit Meter */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Credit Limit Utilization</span>
                      <span className="font-mono">
                        {formatMoney(cust.currentDebt, sym)} / {formatMoney(cust.creditLimit, sym)} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full transition-all ${
                          pct >= 85 ? 'bg-rose-600' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Open Unpaid / Partial Invoices */}
                  {custInvoices.length > 0 && (
                    <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Open Invoices ({custInvoices.length})
                      </div>
                      {custInvoices.map((inv) => {
                        const meta = getPaymentStatusMeta(inv.paymentStatus);
                        return (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => onOpenInvoice(inv)}
                            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                {inv.invoiceNumber}
                              </span>
                              <span className={`font-medium ${meta.textClass}`}>· {meta.label}</span>
                            </div>
                            <div className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                              Due {formatMoney(inv.balanceDue, sym)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">
                    Last activity: {cust.lastTransactionAt ? formatShortDate(cust.lastTransactionAt) : 'New account'}
                  </div>
                  <div className="flex items-center gap-2">
                    {cust.currentDebt > 0 && currentUser.permissions['debt.collect'] && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayingCustomer(cust);
                          setPayAmount(cust.currentDebt.toFixed(2));
                        }}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Pay / Partial Pay
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingCustomer(cust)}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCustomer(cust)}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {cust.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collect Debt Payment Modal */}
      {payingCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handlePayDebt}
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Collect Debt Payment
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {payingCustomer.name} · Current Balance:{' '}
              <strong className="font-mono text-rose-600">
                {formatMoney(payingCustomer.currentDebt, sym)}
              </strong>
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment Amount ({sym})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payingCustomer.currentDebt}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  required
                />
                <div className="mt-1.5 flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setPayAmount((payingCustomer.currentDebt * 0.25).toFixed(2))}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    25% Partial
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount((payingCustomer.currentDebt * 0.5).toFixed(2))}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    50% Partial
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(payingCustomer.currentDebt.toFixed(2))}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Full Settlement
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Receipt / Payment Note
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Optional reference..."
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingCustomer(null)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                {busy ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {editingCustomer.id ? 'Edit Customer Account' : 'New Customer Account'}
            </h3>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Full Name or Clinic Name"
                value={editingCustomer.name || ''}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Phone"
                  value={editingCustomer.phone || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <select
                  value={editingCustomer.type || 'Patient'}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      type: e.target.value as Customer['type'],
                    })
                  }
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="Patient">Patient</option>
                  <option value="Clinic">Clinic</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={editingCustomer.email || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <div>
                  <input
                    type="number"
                    min="0"
                    placeholder="Credit Limit"
                    value={editingCustomer.creditLimit ?? 300}
                    onChange={(e) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        creditLimit: Number(e.target.value),
                      })
                    }
                    className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Address or notes"
                value={editingCustomer.address || ''}
                onChange={(e) =>
                  setEditingCustomer({ ...editingCustomer, address: e.target.value })
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                {busy ? 'Saving...' : 'Save Account'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
