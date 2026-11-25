import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Edit3,
  Package,
  Plus,
  Power,
  Search,
} from 'lucide-react';
import type { Medicine, PharmacyDatabase, StaffUser } from '../types';
import { api, daysUntil, formatMoney } from '../lib/api';

interface InventoryViewProps {
  db: PharmacyDatabase;
  activeBranchId: string;
  currentUser: StaffUser;
  onDbUpdate: (db: PharmacyDatabase) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  db,
  activeBranchId,
  currentUser,
  onDbUpdate,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'LOW' | 'EXPIRING' | 'DISABLED'>('ALL');
  const [editingMed, setEditingMed] = useState<Partial<Medicine> | null>(null);
  const [transferModal, setTransferModal] = useState(false);

  const [trFrom, setTrFrom] = useState(activeBranchId);
  const [trTo, setTrTo] = useState(
    db.branches.find((b) => b.id !== activeBranchId && b.enabled)?.id || activeBranchId
  );
  const [trMedId, setTrMedId] = useState(db.medicines[0]?.id || '');
  const [trQty, setTrQty] = useState('10');
  const [trNotes, setTrNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const sym = db.settings.currencySymbol;
  const activeBranch = db.branches.find((b) => b.id === activeBranchId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.medicines.filter((m) => {
      const lot = m.branchStock[activeBranchId];
      const isLow = lot && lot.quantity <= lot.reorderLevel;
      const isExp = lot && daysUntil(lot.expiryDate) <= db.settings.expiryWarningDays;

      if (filter === 'DISABLED' && m.enabled) return false;
      if (filter !== 'DISABLED' && !m.enabled) return false;
      if (filter === 'LOW' && !isLow) return false;
      if (filter === 'EXPIRING' && !isExp) return false;

      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });
  }, [db.medicines, activeBranchId, filter, search, db.settings.expiryWarningDays]);

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMed?.name?.trim()) return;
    setBusy(true);
    try {
      if (editingMed.id) {
        const res = await api.updateMedicine(editingMed.id, editingMed);
        onDbUpdate(res.db);
        onNotify(`Updated ${editingMed.name}.`, 'success');
      } else {
        const res = await api.createMedicine(editingMed);
        onDbUpdate(res.db);
        onNotify(`Added ${editingMed.name} to catalog.`, 'success');
      }
      setEditingMed(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not save medicine.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (med: Medicine) => {
    setBusy(true);
    try {
      const res = await api.toggleMedicine(med.id);
      onDbUpdate(res.db);
      onNotify(
        med.enabled ? `${med.name} disabled.` : `${med.name} enabled.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Toggle failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.createTransfer({
        fromBranchId: trFrom,
        toBranchId: trTo,
        medicineId: trMedId,
        quantity: Number(trQty),
        notes: trNotes,
      });
      onDbUpdate(res.db);
      setTransferModal(false);
      setTrNotes('');
      onNotify('Inter-branch stock transfer completed.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Transfer failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openNewMedicine = () => {
    const initialStock: Medicine['branchStock'] = {};
    for (const b of db.branches) {
      initialStock[b.id] = {
        quantity: b.id === activeBranchId ? 30 : 15,
        reorderLevel: 15,
        batchNumber: `LOT-${Math.floor(100 + Math.random() * 899)}`,
        expiryDate: '2027-12-31',
      };
    }
    setEditingMed({
      name: '',
      genericName: '',
      sku: '',
      category: 'Antibiotics',
      dosageForm: 'Tablet',
      strength: '500mg',
      unit: 'Box',
      requiresRx: false,
      activeIngredient: '',
      clinicalNotes: '',
      costPrice: 5,
      sellingPrice: 10,
      branchStock: initialStock,
    });
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[210px] flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, SKU, generic..."
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['ALL', 'Active'],
                ['LOW', 'Low Stock'],
                ['EXPIRING', 'Expiring'],
                ['DISABLED', 'Disabled'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === k
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser.permissions['inventory.transfer'] && db.settings.enabledModules.multiBranch && (
            <button
              type="button"
              onClick={() => setTransferModal(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Transfer Stock
            </button>
          )}
          {currentUser.permissions['inventory.edit'] && (
            <button
              type="button"
              onClick={openNewMedicine}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <Plus className="h-4 w-4" />
              Add Medicine
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table / Mobile Cards */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Showing stock for {activeBranch?.name} ({filtered.length} items)
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Package className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2">No medicines match your current filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <tr>
                    <th className="px-5 py-3">Medicine &amp; SKU</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Batch &amp; Expiry</th>
                    <th className="px-4 py-3 text-right">Branch Stock</th>
                    {currentUser.permissions['inventory.view_cost'] && (
                      <th className="px-4 py-3 text-right">Cost / Margin</th>
                    )}
                    <th className="px-4 py-3 text-right">Selling Price</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((med) => {
                    const lot = med.branchStock[activeBranchId] || {
                      quantity: 0,
                      reorderLevel: 15,
                      batchNumber: '—',
                      expiryDate: '—',
                    };
                    const isLow = lot.quantity <= lot.reorderLevel;
                    const expDays = daysUntil(lot.expiryDate);
                    const marginPct =
                      med.sellingPrice > 0
                        ? Math.round(((med.sellingPrice - med.costPrice) / med.sellingPrice) * 100)
                        : 0;

                    return (
                      <tr key={med.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {med.name} <span className="font-normal text-slate-500">{med.strength}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {med.genericName} · <span className="font-mono">{med.sku}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {med.category} · {med.requiresRx ? 'Rx' : 'OTC'}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs">
                          <div className="text-slate-700 dark:text-slate-200">{lot.batchNumber}</div>
                          <div
                            className={
                              expDays <= db.settings.expiryWarningDays
                                ? 'font-semibold text-rose-600'
                                : 'text-slate-500'
                            }
                          >
                            Exp {lot.expiryDate}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              lot.quantity <= 0
                                ? 'text-rose-600'
                                : isLow
                                ? 'text-amber-600'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {isLow && <AlertTriangle className="h-3.5 w-3.5" />}
                            {lot.quantity}
                          </span>
                          <div className="text-xs text-slate-400">Min {lot.reorderLevel}</div>
                        </td>
                        {currentUser.permissions['inventory.view_cost'] && (
                          <td className="px-4 py-3.5 text-right font-mono text-xs">
                            <div className="text-slate-700 dark:text-slate-300">
                              {formatMoney(med.costPrice, sym)}
                            </div>
                            <div className="text-emerald-700 dark:text-emerald-400">
                              +{marginPct}%
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatMoney(med.sellingPrice, sym)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {currentUser.permissions['inventory.edit'] ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingMed(JSON.parse(JSON.stringify(med)))}
                                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggle(med)}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                                  med.enabled
                                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {med.enabled ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Read-only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {filtered.map((med) => {
                const lot = med.branchStock[activeBranchId] || {
                  quantity: 0,
                  reorderLevel: 15,
                  batchNumber: '—',
                  expiryDate: '—',
                };
                return (
                  <div key={med.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {med.name} {med.strength}
                        </div>
                        <div className="text-xs text-slate-500">
                          {med.category} · Batch {lot.batchNumber} · Exp {lot.expiryDate}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatMoney(med.sellingPrice, sym)}
                        </div>
                        <div
                          className={`text-xs font-semibold ${
                            lot.quantity <= lot.reorderLevel ? 'text-amber-600' : 'text-emerald-700'
                          }`}
                        >
                          {lot.quantity} in stock
                        </div>
                      </div>
                    </div>
                    {currentUser.permissions['inventory.edit'] && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingMed(JSON.parse(JSON.stringify(med)))}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-medium dark:border-slate-700"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(med)}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-medium dark:border-slate-700"
                        >
                          <Power className="h-3.5 w-3.5" />
                          {med.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Recent Inter-Branch Transfers */}
      {db.settings.enabledModules.multiBranch && db.transfers.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Recent Inter-Branch Stock Transfers
          </h3>
          <div className="mt-3 space-y-2">
            {db.transfers.slice(0, 5).map((tr) => (
              <div
                key={tr.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50"
              >
                <div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {tr.reference}
                  </span>{' '}
                  · {tr.quantity} × <strong>{tr.medicineName}</strong> ({tr.fromBranchName} →{' '}
                  {tr.toBranchName})
                </div>
                <span className="text-slate-500">By {tr.initiatedBy}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Medicine Modal */}
      {editingMed && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleSaveMedicine}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {editingMed.id ? 'Edit Medicine & Branch Stock' : 'Add New Medicine'}
            </h3>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Brand / Display Name
                </label>
                <input
                  type="text"
                  value={editingMed.name || ''}
                  onChange={(e) => setEditingMed({ ...editingMed, name: e.target.value })}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Generic Name
                </label>
                <input
                  type="text"
                  value={editingMed.genericName || ''}
                  onChange={(e) => setEditingMed({ ...editingMed, genericName: e.target.value })}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Strength &amp; Unit
                </label>
                <input
                  type="text"
                  value={editingMed.strength || ''}
                  onChange={(e) => setEditingMed({ ...editingMed, strength: e.target.value })}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Category
                </label>
                <input
                  type="text"
                  value={editingMed.category || ''}
                  onChange={(e) => setEditingMed({ ...editingMed, category: e.target.value })}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  SKU / Barcode
                </label>
                <input
                  type="text"
                  value={editingMed.sku || ''}
                  onChange={(e) => setEditingMed({ ...editingMed, sku: e.target.value })}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Cost Price ({sym})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingMed.costPrice ?? 0}
                  onChange={(e) =>
                    setEditingMed({ ...editingMed, costPrice: Number(e.target.value) })
                  }
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Selling Price ({sym})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingMed.sellingPrice ?? 0}
                  onChange={(e) =>
                    setEditingMed({ ...editingMed, sellingPrice: Number(e.target.value) })
                  }
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {/* Active Branch Lot */}
              <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Stock Lot for {activeBranch?.name}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="block text-[11px] text-slate-500">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={editingMed.branchStock?.[activeBranchId]?.quantity ?? 0}
                      onChange={(e) =>
                        setEditingMed({
                          ...editingMed,
                          branchStock: {
                            ...(editingMed.branchStock || {}),
                            [activeBranchId]: {
                              ...(editingMed.branchStock?.[activeBranchId] || {
                                reorderLevel: 15,
                                batchNumber: 'LOT-01',
                                expiryDate: '2027-12-31',
                              }),
                              quantity: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Min Alert</label>
                    <input
                      type="number"
                      min="0"
                      value={editingMed.branchStock?.[activeBranchId]?.reorderLevel ?? 15}
                      onChange={(e) =>
                        setEditingMed({
                          ...editingMed,
                          branchStock: {
                            ...(editingMed.branchStock || {}),
                            [activeBranchId]: {
                              ...(editingMed.branchStock?.[activeBranchId] || {
                                quantity: 0,
                                batchNumber: 'LOT-01',
                                expiryDate: '2027-12-31',
                              }),
                              reorderLevel: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Batch #</label>
                    <input
                      type="text"
                      value={editingMed.branchStock?.[activeBranchId]?.batchNumber || ''}
                      onChange={(e) =>
                        setEditingMed({
                          ...editingMed,
                          branchStock: {
                            ...(editingMed.branchStock || {}),
                            [activeBranchId]: {
                              ...(editingMed.branchStock?.[activeBranchId] || {
                                quantity: 0,
                                reorderLevel: 15,
                                expiryDate: '2027-12-31',
                              }),
                              batchNumber: e.target.value,
                            },
                          },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500">Expiry</label>
                    <input
                      type="date"
                      value={editingMed.branchStock?.[activeBranchId]?.expiryDate || '2027-12-31'}
                      onChange={(e) =>
                        setEditingMed({
                          ...editingMed,
                          branchStock: {
                            ...(editingMed.branchStock || {}),
                            [activeBranchId]: {
                              ...(editingMed.branchStock?.[activeBranchId] || {
                                quantity: 0,
                                reorderLevel: 15,
                                batchNumber: 'LOT-01',
                              }),
                              expiryDate: e.target.value,
                            },
                          },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              <label className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(editingMed.requiresRx)}
                  onChange={(e) => setEditingMed({ ...editingMed, requiresRx: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                Prescription Required (Rx Controlled)
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingMed(null)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                {busy ? 'Saving...' : 'Save Medicine'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inter-Branch Stock Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleTransfer}
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Inter-Branch Stock Transfer
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Medicine
                </label>
                <select
                  value={trMedId}
                  onChange={(e) => setTrMedId(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {db.medicines
                    .filter((m) => m.enabled)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.strength}) — {m.branchStock[trFrom]?.quantity ?? 0} in source
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    From Branch
                  </label>
                  <select
                    value={trFrom}
                    onChange={(e) => setTrFrom(e.target.value)}
                    className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {db.branches
                      .filter((b) => b.enabled)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    To Branch
                  </label>
                  <select
                    value={trTo}
                    onChange={(e) => setTrTo(e.target.value)}
                    className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {db.branches
                      .filter((b) => b.enabled)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Quantity to Transfer
                </label>
                <input
                  type="number"
                  min="1"
                  value={trQty}
                  onChange={(e) => setTrQty(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Transfer Note
                </label>
                <input
                  type="text"
                  value={trNotes}
                  onChange={(e) => setTrNotes(e.target.value)}
                  placeholder="Dispatch courier or reason"
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferModal(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                {busy ? 'Transferring...' : 'Execute Transfer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
