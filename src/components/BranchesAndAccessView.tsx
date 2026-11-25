import React, { useState } from 'react';
import {
  Building2,
  Edit3,
  History,
  Plus,
  Power,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type {
  Branch,
  PermissionKey,
  PharmacyDatabase,
  StaffRole,
  StaffUser,
} from '../types';
import { api, formatDateTime } from '../lib/api';

interface BranchesAndAccessViewProps {
  db: PharmacyDatabase;
  currentUser: StaffUser;
  onDbUpdate: (db: PharmacyDatabase) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const PERMISSION_LABELS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'pos.sell', label: 'POS Selling & Checkout' },
  { key: 'pos.credit_sale', label: 'Authorize Credit / Debt Sales' },
  { key: 'pos.discount', label: 'Apply Discounts' },
  { key: 'debt.collect', label: 'Collect Debt Payments' },
  { key: 'invoices.edit', label: 'Edit Existing Invoices' },
  { key: 'invoices.toggle', label: 'Disable / Void Invoices' },
  { key: 'inventory.edit', label: 'Add / Edit / Toggle Medicines' },
  { key: 'inventory.transfer', label: 'Transfer Stock Between Branches' },
  { key: 'inventory.view_cost', label: 'View Cost & Profit Margin' },
  { key: 'branches.manage', label: 'Manage Branches' },
  { key: 'users.manage', label: 'Manage Staff & Permissions' },
  { key: 'settings.manage', label: 'Edit System Settings' },
  { key: 'ai.use', label: 'Use AI Clinical & Business Advisor' },
];

const ROLE_PRESETS: Record<StaffRole, Record<PermissionKey, boolean>> = {
  Owner: Object.fromEntries(PERMISSION_LABELS.map((p) => [p.key, true])) as Record<
    PermissionKey,
    boolean
  >,
  Pharmacist: {
    'pos.sell': true,
    'pos.credit_sale': true,
    'pos.discount': true,
    'inventory.edit': true,
    'inventory.transfer': true,
    'inventory.view_cost': true,
    'invoices.edit': true,
    'invoices.toggle': false,
    'debt.collect': true,
    'branches.manage': false,
    'users.manage': false,
    'settings.manage': false,
    'ai.use': true,
  },
  'Branch Manager': {
    'pos.sell': true,
    'pos.credit_sale': true,
    'pos.discount': true,
    'inventory.edit': true,
    'inventory.transfer': true,
    'inventory.view_cost': true,
    'invoices.edit': true,
    'invoices.toggle': true,
    'debt.collect': true,
    'branches.manage': false,
    'users.manage': false,
    'settings.manage': false,
    'ai.use': true,
  },
  Cashier: {
    'pos.sell': true,
    'pos.credit_sale': false,
    'pos.discount': false,
    'inventory.edit': false,
    'inventory.transfer': false,
    'inventory.view_cost': false,
    'invoices.edit': false,
    'invoices.toggle': false,
    'debt.collect': true,
    'branches.manage': false,
    'users.manage': false,
    'settings.manage': false,
    'ai.use': false,
  },
};

export const BranchesAndAccessView: React.FC<BranchesAndAccessViewProps> = ({
  db,
  currentUser,
  onDbUpdate,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'BRANCHES' | 'ACCESS' | 'AUDIT'>('BRANCHES');
  const [editingBranch, setEditingBranch] = useState<Partial<Branch> | null>(null);
  const [editingUser, setEditingUser] = useState<Partial<StaffUser> | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch?.name?.trim()) return;
    setBusy(true);
    try {
      if (editingBranch.id) {
        const res = await api.updateBranch(editingBranch.id, editingBranch);
        onDbUpdate(res.db);
        onNotify(`Updated branch ${editingBranch.name}.`, 'success');
      } else {
        const res = await api.createBranch(editingBranch);
        onDbUpdate(res.db);
        onNotify(`Created branch ${editingBranch.name}.`, 'success');
      }
      setEditingBranch(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save branch.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBranch = async (branch: Branch) => {
    setBusy(true);
    try {
      const res = await api.updateBranch(branch.id, { enabled: !branch.enabled });
      onDbUpdate(res.db);
      onNotify(
        branch.enabled ? `${branch.name} disabled.` : `${branch.name} enabled.`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to toggle branch.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser?.name?.trim() || !editingUser.role) return;
    setBusy(true);
    try {
      if (editingUser.id) {
        const res = await api.updateUser(editingUser.id, editingUser);
        onDbUpdate(res.db);
        onNotify(`Updated permissions for ${editingUser.name}.`, 'success');
      } else {
        const res = await api.createUser(editingUser);
        onDbUpdate(res.db);
        onNotify(`Added staff member ${editingUser.name}.`, 'success');
      }
      setEditingUser(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save staff.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUser = async (user: StaffUser) => {
    setBusy(true);
    try {
      const res = await api.updateUser(user.id, { enabled: !user.enabled });
      onDbUpdate(res.db);
      onNotify(user.enabled ? `${user.name} disabled.` : `${user.name} enabled.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to toggle staff.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('BRANCHES')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 text-xs font-semibold ${
              subTab === 'BRANCHES'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Multi-Branch ({db.branches.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ACCESS')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 text-xs font-semibold ${
              subTab === 'ACCESS'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Staff &amp; Access Control ({db.users.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('AUDIT')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 text-xs font-semibold ${
              subTab === 'AUDIT'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Audit Log
          </button>
        </div>

        {subTab === 'BRANCHES' && currentUser.permissions['branches.manage'] && (
          <button
            type="button"
            onClick={() =>
              setEditingBranch({
                name: '',
                code: `BR-0${db.branches.length + 1}`,
                address: '',
                phone: '',
                email: '',
                managerName: '',
                openingHours: '08:00 – 21:00',
              })
            }
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Add Branch
          </button>
        )}

        {subTab === 'ACCESS' && currentUser.permissions['users.manage'] && (
          <button
            type="button"
            onClick={() =>
              setEditingUser({
                name: '',
                email: '',
                role: 'Cashier',
                branchId: db.branches[0]?.id || 'br-main',
                pin: '1234',
                permissions: { ...ROLE_PRESETS.Cashier },
              })
            }
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <UserPlus className="h-4 w-4" />
            Add Staff User
          </button>
        )}
      </div>

      {/* BRANCHES TAB */}
      {subTab === 'BRANCHES' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {db.branches.map((br) => {
            const totalUnits = db.medicines.reduce(
              (s, m) => s + (m.branchStock[br.id]?.quantity ?? 0),
              0
            );
            const branchInvoices = db.invoices.filter((i) => i.branchId === br.id && i.enabled);
            return (
              <div
                key={br.id}
                className={`flex flex-col justify-between rounded-xl border bg-white p-5 dark:bg-slate-900 ${
                  br.enabled
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-slate-200 opacity-60 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-slate-500">
                        {br.code} · {br.isPrimary ? 'Primary HQ' : 'Branch'}
                      </div>
                      <h3 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white">
                        {br.name}
                      </h3>
                    </div>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                        br.enabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      {br.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <div>{br.address || 'No street address'}</div>
                    <div>
                      Manager: <strong className="text-slate-800 dark:text-slate-200">{br.managerName}</strong>
                    </div>
                    <div>Hours: {br.openingHours}</div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <div>
                      <div className="text-slate-500">Stock Units</div>
                      <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {totalUnits}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Invoices</div>
                      <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                        {branchInvoices.length}
                      </div>
                    </div>
                  </div>
                </div>

                {currentUser.permissions['branches.manage'] && (
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingBranch(br)}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    {!br.isPrimary && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleToggleBranch(br)}
                        className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                      >
                        <Power className="h-3.5 w-3.5" />
                        {br.enabled ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ACCESS CONTROL TAB */}
      {subTab === 'ACCESS' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {db.users.map((u) => {
            const branchName = db.branches.find((b) => b.id === u.branchId)?.name || 'All';
            const enabledCount = Object.values(u.permissions).filter(Boolean).length;
            return (
              <div
                key={u.id}
                className={`rounded-xl border bg-white p-5 dark:bg-slate-900 ${
                  u.enabled
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-slate-200 opacity-60 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      {u.role} · {branchName} · PIN <span className="font-mono">{u.pin}</span>
                    </div>
                    <h3 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white">
                      {u.name}
                    </h3>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                      u.enabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800'
                    }`}
                  >
                    {u.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                  Permissions granted: <strong className="font-mono">{enabledCount}</strong> /{' '}
                  {PERMISSION_LABELS.length}
                </div>

                {currentUser.permissions['users.manage'] && (
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingUser({ ...u, permissions: { ...u.permissions } })
                      }
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit Role &amp; Permissions
                    </button>
                    {u.id !== currentUser.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleToggleUser(u)}
                        className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                      >
                        <Power className="h-3.5 w-3.5" />
                        {u.enabled ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AUDIT LOG TAB */}
      {subTab === 'AUDIT' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {db.auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">{log.action}</span>{' '}
                  · <span className="text-slate-600 dark:text-slate-300">{log.details}</span>
                </div>
                <div className="text-slate-500">
                  {log.userName} ({log.branchName}) · {formatDateTime(log.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Branch Modal */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleSaveBranch}
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {editingBranch.id ? 'Edit Branch' : 'Add Pharmacy Branch'}
            </h3>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Branch Name"
                value={editingBranch.name || ''}
                onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Code (e.g. BR-04)"
                  value={editingBranch.code || ''}
                  onChange={(e) => setEditingBranch({ ...editingBranch, code: e.target.value })}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  type="text"
                  placeholder="Manager Name"
                  value={editingBranch.managerName || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, managerName: e.target.value })
                  }
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <input
                type="text"
                placeholder="Street Address"
                value={editingBranch.address || ''}
                onChange={(e) => setEditingBranch({ ...editingBranch, address: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Phone"
                  value={editingBranch.phone || ''}
                  onChange={(e) => setEditingBranch({ ...editingBranch, phone: e.target.value })}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <input
                  type="text"
                  placeholder="Opening Hours"
                  value={editingBranch.openingHours || ''}
                  onChange={(e) =>
                    setEditingBranch({ ...editingBranch, openingHours: e.target.value })
                  }
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingBranch(null)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white"
              >
                {busy ? 'Saving...' : 'Save Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Staff & Permissions Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleSaveUser}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {editingUser.id ? 'Edit Staff Access & Role' : 'Create Staff Account'}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Full Name"
                value={editingUser.name || ''}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={editingUser.email || ''}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <select
                value={editingUser.role || 'Cashier'}
                onChange={(e) => {
                  const nextRole = e.target.value as StaffRole;
                  setEditingUser({
                    ...editingUser,
                    role: nextRole,
                    permissions: { ...ROLE_PRESETS[nextRole] },
                  });
                }}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="Owner">Owner</option>
                <option value="Pharmacist">Pharmacist</option>
                <option value="Branch Manager">Branch Manager</option>
                <option value="Cashier">Cashier</option>
              </select>
              <select
                value={editingUser.branchId || db.branches[0]?.id}
                onChange={(e) => setEditingUser({ ...editingUser, branchId: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  4-Digit Quick Switch PIN
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={editingUser.pin || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, pin: e.target.value })}
                  className="min-h-[40px] w-36 rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Granular Access Permissions
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMISSION_LABELS.map((perm) => {
                  const checked = Boolean(editingUser.permissions?.[perm.key]);
                  return (
                    <label
                      key={perm.key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            permissions: {
                              ...(editingUser.permissions || ROLE_PRESETS.Cashier),
                              [perm.key]: e.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span className="text-slate-700 dark:text-slate-300">{perm.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white"
              >
                {busy ? 'Saving...' : 'Save Staff & Permissions'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
