import React, { useState } from 'react';
import { Moon, Save, Sun } from 'lucide-react';
import type {
  InvoiceLayout,
  InvoiceTheme,
  PharmacyDatabase,
  PharmacySettings,
  StaffUser,
} from '../types';
import { api } from '../lib/api';

interface SettingsViewProps {
  db: PharmacyDatabase;
  currentUser: StaffUser;
  onDbUpdate: (db: PharmacyDatabase) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db,
  currentUser,
  onDbUpdate,
  onNotify,
}) => {
  const [form, setForm] = useState<PharmacySettings>(db.settings);
  const [saving, setSaving] = useState(false);

  const canEdit = currentUser.permissions['settings.manage'];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await api.updateSettings(form);
      onDbUpdate(res.db);
      onNotify('Pharmacy settings saved.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {!canEdit && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Settings are in read-only mode for {currentUser.role}. Switch to an Owner session to modify configuration.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Branding & Tax */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Pharmacy Identity &amp; Tax
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Pharmacy Brand Name
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.pharmacyName}
                onChange={(e) => setForm({ ...form, pharmacyName: e.target.value })}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Pharmacy License #
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Default Tax / VAT (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                disabled={!canEdit}
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Currency Symbol
              </label>
              <select
                disabled={!canEdit}
                value={form.currencySymbol}
                onChange={(e) => {
                  const map: Record<string, string> = {
                    $: 'USD',
                    '€': 'EUR',
                    '£': 'GBP',
                    'KES ': 'KES',
                    'TZS ': 'TZS',
                    '₦': 'NGN',
                  };
                  setForm({
                    ...form,
                    currencySymbol: e.target.value,
                    currencyCode: map[e.target.value] || 'USD',
                  });
                }}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="$">$ (USD)</option>
                <option value="€">€ (EUR)</option>
                <option value="£">£ (GBP)</option>
                <option value="KES ">KES (Kenyan Shilling)</option>
                <option value="TZS ">TZS (Tanzanian Shilling)</option>
                <option value="₦">₦ (Naira)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Expiry Alert Window (Days)
              </label>
              <input
                type="number"
                min="7"
                disabled={!canEdit}
                value={form.expiryWarningDays}
                onChange={(e) =>
                  setForm({ ...form, expiryWarningDays: Number(e.target.value) })
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Smart Invoice Color & Arrangement Defaults */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Smart Invoice Appearance &amp; Rules
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Default Invoice Color Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['emerald', 'Clinical Emerald', 'bg-emerald-700'],
                    ['sapphire', 'Royal Sapphire', 'bg-blue-800'],
                    ['slate', 'Editorial Slate', 'bg-slate-900'],
                    ['amber', 'Warm Apothecary', 'bg-amber-800'],
                  ] as Array<[InvoiceTheme, string, string]>
                ).map(([id, label, swatch]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setForm({ ...form, defaultInvoiceTheme: id })}
                    className={`flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                      form.defaultInvoiceTheme === id
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full ${swatch}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Default Arrangement
                </label>
                <select
                  disabled={!canEdit}
                  value={form.defaultInvoiceLayout}
                  onChange={(e) =>
                    setForm({ ...form, defaultInvoiceLayout: e.target.value as InvoiceLayout })
                  }
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="detailed">Detailed Clinical A4</option>
                  <option value="compact">Compact 80mm Receipt</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Interface Theme
                </label>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    setForm({
                      ...form,
                      themeMode: form.themeMode === 'light' ? 'dark' : 'light',
                    })
                  }
                  className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800"
                >
                  {form.themeMode === 'dark' ? (
                    <>
                      <Moon className="h-4 w-4 text-emerald-400" />
                      Dark Mode
                    </>
                  ) : (
                    <>
                      <Sun className="h-4 w-4 text-amber-500" />
                      Light Mode
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Invoice Footer Counseling Note
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.invoiceFooterNote}
                onChange={(e) => setForm({ ...form, invoiceFooterNote: e.target.value })}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Enable / Disable Modules & Policies */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Operational Policies &amp; Feature Modules (Enable / Disable)
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Allow Credit &amp; Partial Debt Sales
              </span>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.allowCreditSales}
                onChange={(e) => setForm({ ...form, allowCreditSales: e.target.checked })}
                className="h-4 w-4 rounded text-emerald-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                AI Clinical &amp; Business Advisor
              </span>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.enabledModules.aiAdvisor}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enabledModules: { ...form.enabledModules, aiAdvisor: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded text-emerald-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Multi-Branch Stock Transfers
              </span>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.enabledModules.multiBranch}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enabledModules: { ...form.enabledModules, multiBranch: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded text-emerald-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Debt Management Ledger
              </span>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.enabledModules.debtLedger}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enabledModules: { ...form.enabledModules, debtLedger: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded text-emerald-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Smart Invoice Studio
              </span>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.enabledModules.smartInvoices}
                onChange={(e) =>
                  setForm({
                    ...form,
                    enabledModules: { ...form.enabledModules, smartInvoices: e.target.checked },
                  })
                }
                className="h-4 w-4 rounded text-emerald-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Require Pharmacist Rx Check
              </span>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.requireRxVerification}
                onChange={(e) => setForm({ ...form, requireRxVerification: e.target.checked })}
                className="h-4 w-4 rounded text-emerald-600"
              />
            </label>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving Settings...' : 'Save Configuration'}
          </button>
        </div>
      )}
    </form>
  );
};
