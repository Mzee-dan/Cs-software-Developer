import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CreditCard,
  FileText,
  Package,
  Sparkles,
} from 'lucide-react';
import type { Invoice, PharmacyDatabase, StaffUser } from '../types';
import { daysUntil, formatMoney, getPaymentStatusMeta } from '../lib/api';

interface OverviewDashboardProps {
  db: PharmacyDatabase;
  activeBranchId: string;
  currentUser: StaffUser;
  onNavigate: (tab: 'POS' | 'INVENTORY' | 'DEBT' | 'INVOICES' | 'AI') => void;
  onOpenInvoice: (inv: Invoice) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  db,
  activeBranchId,
  currentUser,
  onNavigate,
  onOpenInvoice,
}) => {
  const sym = db.settings.currencySymbol;
  const activeBranch = db.branches.find((b) => b.id === activeBranchId);

  const metrics = useMemo(() => {
    const activeInvoices = db.invoices.filter((i) => i.enabled && i.paymentStatus !== 'VOID');
    const branchInvoices = activeInvoices.filter((i) => i.branchId === activeBranchId);
    const totalBilled = activeInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const branchBilled = branchInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const totalCollected = activeInvoices.reduce((s, i) => s + i.amountPaid, 0);
    const totalDebt = db.customers.reduce((s, c) => s + c.currentDebt, 0);

    const lowStockList = db.medicines.filter((m) => {
      if (!m.enabled) return false;
      const lot = m.branchStock[activeBranchId];
      return lot && lot.quantity <= lot.reorderLevel;
    });

    const expiringList = db.medicines.filter((m) => {
      if (!m.enabled) return false;
      const lot = m.branchStock[activeBranchId];
      return lot && daysUntil(lot.expiryDate) <= db.settings.expiryWarningDays;
    });

    return {
      totalBilled,
      branchBilled,
      totalCollected,
      totalDebt,
      lowStockList,
      expiringList,
      openDebtInvoices: activeInvoices.filter((i) => i.balanceDue > 0.005),
    };
  }, [db, activeBranchId]);

  const maxBranchRev = useMemo(() => {
    const vals = db.branches.map((b) =>
      db.invoices
        .filter((i) => i.enabled && i.branchId === b.id)
        .reduce((s, i) => s + i.grandTotal, 0)
    );
    return Math.max(100, ...vals);
  }, [db.branches, db.invoices]);

  return (
    <div className="space-y-5">
      {/* Executive Welcome Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {activeBranch?.name} · {currentUser.role} Session
          </div>
          <h2 className="mt-0.5 font-display text-xl font-bold text-slate-900 dark:text-white">
            Welcome back, {currentUser.name}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {metrics.lowStockList.length} low-stock alert{metrics.lowStockList.length === 1 ? '' : 's'} ·{' '}
            {metrics.openDebtInvoices.length} open credit invoice{metrics.openDebtInvoices.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('POS')}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            Open POS Checkout
            <ArrowRight className="h-4 w-4" />
          </button>
          {db.settings.enabledModules.aiAdvisor && currentUser.permissions['ai.use'] && (
            <button
              type="button"
              onClick={() => onNavigate('AI')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Sparkles className="h-4 w-4 text-emerald-600" />
              AI Decisions
            </button>
          )}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Network Sales Billed</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(metrics.totalBilled, sym)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Active branch: {formatMoney(metrics.branchBilled, sym)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Cash &amp; Card Collected</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {formatMoney(metrics.totalCollected, sym)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Settled receipts across branches</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Customer Debt Ledger</div>
          <div className="mt-1 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
            {formatMoney(metrics.totalDebt, sym)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {metrics.openDebtInvoices.length} unpaid/partial invoices
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Branch Stock Health</div>
          <div className="mt-1 font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
            {metrics.lowStockList.length + metrics.expiringList.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {metrics.lowStockList.length} low stock · {metrics.expiringList.length} expiring soon
          </div>
        </div>
      </div>

      {/* Multi-Branch Comparison + Action Queues */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Multi-Branch Performance */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900 dark:text-white">
              <Building2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              Multi-Branch Performance
            </h3>
            <span className="text-xs text-slate-500">{db.branches.filter((b) => b.enabled).length} active</span>
          </div>

          <div className="mt-4 space-y-4">
            {db.branches.map((br) => {
              const rev = db.invoices
                .filter((i) => i.enabled && i.branchId === br.id)
                .reduce((s, i) => s + i.grandTotal, 0);
              const collected = db.invoices
                .filter((i) => i.enabled && i.branchId === br.id)
                .reduce((s, i) => s + i.amountPaid, 0);
              const units = db.medicines.reduce(
                (s, m) => s + (m.branchStock[br.id]?.quantity ?? 0),
                0
              );
              const widthPct = Math.max(8, Math.round((rev / maxBranchRev) * 100));

              return (
                <div key={br.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {br.name}
                      {br.id === activeBranchId && (
                        <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">· Current</span>
                      )}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {formatMoney(rev, sym)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Collected {formatMoney(collected, sym)}</span>
                    <span>{units} units in stock</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Open Debt & Credit Invoices */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900 dark:text-white">
              <CreditCard className="h-4 w-4 text-rose-600" />
              Credit &amp; Partial Payment Queue
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('DEBT')}
              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Manage All Debt
            </button>
          </div>

          {metrics.openDebtInvoices.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-500">
              All customer invoices are currently paid in full.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {metrics.openDebtInvoices.slice(0, 5).map((inv) => {
                const meta = getPaymentStatusMeta(inv.paymentStatus);
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => onOpenInvoice(inv)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {inv.invoiceNumber}
                        </span>
                        <span className={`font-semibold ${meta.textClass}`}>· {meta.label}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {inv.customerName} · Paid {formatMoney(inv.amountPaid, sym)} of{' '}
                        {formatMoney(inv.grandTotal, sym)}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                        {formatMoney(inv.balanceDue, sym)}
                      </div>
                      <div className="text-[11px] text-slate-400">Due {inv.dueDate}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Low Stock & Expiry Queue */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900 dark:text-white">
            <Package className="h-4 w-4 text-amber-600" />
            Stock &amp; Expiry Attention ({activeBranch?.name})
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('INVENTORY')}
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Open Inventory
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.lowStockList.slice(0, 6).map((m) => {
            const lot = m.branchStock[activeBranchId];
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-2.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/20"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {m.name} {m.strength}
                  </div>
                  <div className="text-slate-500">Reorder min {lot.reorderLevel}</div>
                </div>
                <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {lot.quantity}
                </span>
              </div>
            );
          })}
          {metrics.lowStockList.length === 0 && (
            <p className="text-xs text-slate-500">No low-stock items in this branch.</p>
          )}
        </div>
      </div>
    </div>
  );
};
