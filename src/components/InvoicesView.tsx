import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  Search,
} from 'lucide-react';
import type { Invoice, PaymentStatus, PharmacyDatabase } from '../types';
import { formatMoney, formatShortDate, getPaymentStatusMeta } from '../lib/api';

interface InvoicesViewProps {
  db: PharmacyDatabase;
  activeBranchId: string;
  onOpenInvoice: (inv: Invoice) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  db,
  activeBranchId,
  onOpenInvoice,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [branchScope, setBranchScope] = useState<'ACTIVE' | 'ALL'>('ALL');

  const sym = db.settings.currencySymbol;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.invoices.filter((inv) => {
      if (branchScope === 'ACTIVE' && inv.branchId !== activeBranchId) return false;
      if (statusFilter !== 'ALL' && inv.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.branchName.toLowerCase().includes(q)
      );
    });
  }, [db.invoices, activeBranchId, branchScope, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, customer, branch..."
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['ALL', 'All'],
                ['PAID', 'Paid'],
                ['PARTIAL', 'Partial'],
                ['UNPAID', 'Unpaid'],
                ['VOID', 'Disabled'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === k
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setBranchScope('ALL')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              branchScope === 'ALL'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            All Branches
          </button>
          <button
            type="button"
            onClick={() => setBranchScope('ACTIVE')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              branchScope === 'ACTIVE'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Active Branch
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <FileText className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2">No invoices found for the selected criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((inv) => {
            const meta = getPaymentStatusMeta(inv.paymentStatus);
            const Icon =
              inv.paymentStatus === 'PAID'
                ? CheckCircle2
                : inv.paymentStatus === 'PARTIAL'
                ? Clock
                : inv.paymentStatus === 'UNPAID'
                ? AlertTriangle
                : Ban;

            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => onOpenInvoice(inv)}
                className={`flex flex-col justify-between rounded-xl border bg-white p-4 text-left transition-all hover:border-emerald-400 hover:shadow-sm dark:bg-slate-900 ${
                  inv.enabled
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-slate-200 opacity-65 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {inv.invoiceNumber}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {formatShortDate(inv.createdAt)} · {inv.branchName}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.surfaceClass} ${meta.textClass}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {inv.customerName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {inv.items.length} line item{inv.items.length === 1 ? '' : 's'} · Theme:{' '}
                    <span className="capitalize">{inv.invoiceTheme}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <div className="text-xs text-slate-500">Paid / Due</div>
                    <div className="font-mono text-xs font-semibold">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {formatMoney(inv.amountPaid, sym)}
                      </span>
                      <span className="mx-1 text-slate-400">/</span>
                      <span
                        className={
                          inv.balanceDue > 0.005 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                        }
                      >
                        {formatMoney(inv.balanceDue, sym)} due
                      </span>
                    </div>
                  </div>
                  <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                    {formatMoney(inv.grandTotal, sym)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
