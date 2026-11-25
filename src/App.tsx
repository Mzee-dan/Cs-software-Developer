import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Lock,
  Menu,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  UserCheck,
  X,
  AlertCircle,
} from 'lucide-react';
import type { Invoice, PharmacyDatabase, StaffUser } from './types';
import { api } from './lib/api';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PosWorkspace } from './components/PosWorkspace';
import { InventoryView } from './components/InventoryView';
import { DebtAndCustomersView } from './components/DebtAndCustomersView';
import { InvoicesView } from './components/InvoicesView';
import { AiAdvisorView } from './components/AiAdvisorView';
import { BranchesAndAccessView } from './components/BranchesAndAccessView';
import { SettingsView } from './components/SettingsView';
import { SmartInvoiceModal } from './components/SmartInvoiceModal';

type NavTab =
  | 'OVERVIEW'
  | 'POS'
  | 'INVENTORY'
  | 'DEBT'
  | 'INVOICES'
  | 'AI'
  | 'ACCESS'
  | 'SETTINGS';

export default function App() {
  const [db, setDb] = useState<PharmacyDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('OVERVIEW');
  const [activeBranchId, setActiveBranchId] = useState<string>('br-main');
  const [activeUserId, setActiveUserId] = useState<string>('usr-owner');

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Staff switcher modal
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [pinTargetUser, setPinTargetUser] = useState<StaffUser | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);

  const notify = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ msg, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 4200);
  };

  useEffect(() => {
    let mounted = true;
    api
      .bootstrap()
      .then((data) => {
        if (!mounted) return;
        setDb(data);
        const firstEnabledBranch = data.branches.find((b) => b.enabled) || data.branches[0];
        if (firstEnabledBranch) setActiveBranchId(firstEnabledBranch.id);
        const firstEnabledUser = data.users.find((u) => u.enabled) || data.users[0];
        if (firstEnabledUser) {
          setActiveUserId(firstEnabledUser.id);
          api.setUserId(firstEnabledUser.id);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load pharmacy system.');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    if (!db) return;
    const isDark = db.settings.themeMode === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [db?.settings.themeMode]);

  const currentUser = useMemo(() => {
    if (!db) return null;
    return db.users.find((u) => u.id === activeUserId) || db.users[0];
  }, [db, activeUserId]);

  const selectedInvoice = useMemo(() => {
    if (!db || !selectedInvoiceId) return null;
    return db.invoices.find((i) => i.id === selectedInvoiceId) || null;
  }, [db, selectedInvoiceId]);

  const handleToggleThemeQuick = async () => {
    if (!db || !currentUser) return;
    const nextMode = db.settings.themeMode === 'dark' ? 'light' : 'dark';
    // Update locally immediately for instant feedback, persist if permitted
    setDb({
      ...db,
      settings: { ...db.settings, themeMode: nextMode },
    });
    if (currentUser.permissions['settings.manage']) {
      try {
        const res = await api.updateSettings({ ...db.settings, themeMode: nextMode });
        setDb(res.db);
      } catch {
        // ignore if read-only role
      }
    }
  };

  const handleSwitchUserConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTargetUser) return;
    if (pinInput.trim() !== pinTargetUser.pin) {
      setPinError('Incorrect PIN. Check the staff card hint.');
      return;
    }
    setActiveUserId(pinTargetUser.id);
    api.setUserId(pinTargetUser.id);
    if (pinTargetUser.branchId && db?.branches.some((b) => b.id === pinTargetUser.branchId && b.enabled)) {
      setActiveBranchId(pinTargetUser.branchId);
    }
    setPinTargetUser(null);
    setPinInput('');
    setPinError('');
    setStaffModalOpen(false);
    notify(`Switched active session to ${pinTargetUser.name} (${pinTargetUser.role}).`, 'success');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
          <p className="font-display text-sm font-semibold text-slate-800 dark:text-slate-200">
            Loading Botanica Rx Workspace...
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !db || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center dark:border-rose-900 dark:bg-slate-900">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <h1 className="mt-2 font-display text-base font-bold text-slate-900 dark:text-white">
            Unable to Connect to Pharmacy Server
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {loadError || 'Database initialization failed.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'POS', label: 'POS & Selling', icon: ShoppingCart, visible: true },
    { id: 'INVENTORY', label: 'Inventory', icon: Package, visible: true },
    {
      id: 'DEBT',
      label: 'Debt & Customers',
      icon: CreditCard,
      visible: db.settings.enabledModules.debtLedger,
    },
    {
      id: 'INVOICES',
      label: 'Smart Invoices',
      icon: FileText,
      visible: db.settings.enabledModules.smartInvoices,
    },
    {
      id: 'AI',
      label: 'AI Decisions',
      icon: Sparkles,
      visible: db.settings.enabledModules.aiAdvisor,
    },
    { id: 'ACCESS', label: 'Branches & Access', icon: Building2, visible: true },
    { id: 'SETTINGS', label: 'Settings', icon: Settings, visible: true },
  ];

  const activeNavMeta = navItems.find((n) => n.id === activeTab) || navItems[0];
  const activeBranches = db.branches.filter((b) => b.enabled);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
          <img
            src="/src/assets/images/pharmacy_emblem_1795099259766.jpg"
            alt={db.settings.pharmacyName}
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-contain p-0.5 dark:border-slate-700"
          />
          <span className="truncate font-display text-base font-bold tracking-tight text-slate-900 dark:text-white">
            {db.settings.pharmacyName}
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems
            .filter((n) => n.visible)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex min-h-[42px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>

        {/* Active Staff Session Card */}
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setStaffModalOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-800/60"
          >
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-display text-xs font-bold text-white">
                {currentUser.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                {currentUser.name}
              </div>
              <div className="truncate text-[11px] text-slate-500">
                {currentUser.role} · Switch
              </div>
            </div>
            <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="lg:pl-64">
        {/* Top Bar (Desktop 56px / Mobile 52px) */}
        <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:h-16 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/src/assets/images/pharmacy_emblem_1795099259766.jpg"
              alt={db.settings.pharmacyName}
              referrerPolicy="no-referrer"
              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 object-contain p-0.5 dark:border-slate-700 lg:hidden"
            />
            <h1 className="truncate font-display text-base font-bold text-slate-900 dark:text-white lg:text-lg">
              {activeNavMeta.label}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <select
              aria-label="Active Branch"
              value={activeBranchId}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="max-w-[165px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[230px]"
            >
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleToggleThemeQuick}
              aria-label="Toggle light or dark mode"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {db.settings.themeMode === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setStaffModalOpen(true)}
              aria-label="Switch Staff Session"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 lg:hidden"
            >
              <UserCheck className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('POS')}
              className="hidden min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-3.5 text-xs font-semibold text-white hover:bg-emerald-800 sm:inline-flex"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              New Sale
            </button>
          </div>
        </header>

        {/* Viewport Body */}
        <main
          className={`mx-auto max-w-7xl p-4 sm:p-6 ${
            activeTab === 'POS' ? 'pb-36 lg:pb-8' : 'pb-24 lg:pb-8'
          }`}
        >
          {activeTab === 'OVERVIEW' && (
            <OverviewDashboard
              db={db}
              activeBranchId={activeBranchId}
              currentUser={currentUser}
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenInvoice={(inv) => setSelectedInvoiceId(inv.id)}
            />
          )}

          {activeTab === 'POS' && (
            <PosWorkspace
              db={db}
              activeBranchId={activeBranchId}
              currentUser={currentUser}
              onDbUpdate={setDb}
              onOpenInvoice={(inv) => setSelectedInvoiceId(inv.id)}
              onNotify={notify}
            />
          )}

          {activeTab === 'INVENTORY' && (
            <InventoryView
              db={db}
              activeBranchId={activeBranchId}
              currentUser={currentUser}
              onDbUpdate={setDb}
              onNotify={notify}
            />
          )}

          {activeTab === 'DEBT' && (
            <DebtAndCustomersView
              db={db}
              currentUser={currentUser}
              onDbUpdate={setDb}
              onOpenInvoice={(inv) => setSelectedInvoiceId(inv.id)}
              onNotify={notify}
            />
          )}

          {activeTab === 'INVOICES' && (
            <InvoicesView
              db={db}
              activeBranchId={activeBranchId}
              onOpenInvoice={(inv) => setSelectedInvoiceId(inv.id)}
            />
          )}

          {activeTab === 'AI' && (
            <AiAdvisorView
              db={db}
              activeBranchId={activeBranchId}
              currentUser={currentUser}
              onNotify={notify}
            />
          )}

          {activeTab === 'ACCESS' && (
            <BranchesAndAccessView
              db={db}
              currentUser={currentUser}
              onDbUpdate={setDb}
              onNotify={notify}
            />
          )}

          {activeTab === 'SETTINGS' && (
            <SettingsView
              db={db}
              currentUser={currentUser}
              onDbUpdate={setDb}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar (Thumb Zone, 64px height) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid h-16 grid-cols-5 items-center border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        {(
          [
            { id: 'OVERVIEW', label: 'Home', icon: LayoutDashboard },
            { id: 'POS', label: 'POS', icon: ShoppingCart },
            { id: 'INVENTORY', label: 'Stock', icon: Package },
            { id: 'DEBT', label: 'Debt', icon: CreditCard },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex min-h-[44px] flex-col items-center justify-center ${
                active
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5 text-[11px] font-medium">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className={`flex min-h-[44px] flex-col items-center justify-center ${
            mobileMenuOpen ||
            ['INVOICES', 'AI', 'ACCESS', 'SETTINGS'].includes(activeTab)
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Menu className="h-5 w-5" />
          <span className="mt-0.5 text-[11px] font-medium">More</span>
        </button>
      </nav>

      {/* Mobile More Bottom Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/50 backdrop-blur-sm lg:hidden">
          <div className="w-full rounded-t-3xl border-t border-slate-200 bg-white p-5 pb-24 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Modules &amp; Administration
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {navItems
                .filter((n) => n.visible && ['INVOICES', 'AI', 'ACCESS', 'SETTINGS'].includes(n.id))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-left text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                      {item.label}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Smart Invoice Modal */}
      {selectedInvoice && (
        <SmartInvoiceModal
          invoice={selectedInvoice}
          settings={db.settings}
          customers={db.customers}
          medicines={db.medicines}
          currentUser={currentUser}
          onClose={() => setSelectedInvoiceId(null)}
          onDatabaseUpdate={(_nextInv, nextDb) => setDb(nextDb)}
          onNotify={notify}
        />
      )}

      {/* Staff Switcher & Access Verification Modal */}
      {staffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Staff Session &amp; Access Control
              </h3>
              <button
                type="button"
                onClick={() => {
                  setStaffModalOpen(false);
                  setPinTargetUser(null);
                  setPinInput('');
                  setPinError('');
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!pinTargetUser ? (
              <div className="mt-4 space-y-2.5">
                {db.users
                  .filter((u) => u.enabled)
                  .map((u) => {
                    const brName =
                      db.branches.find((b) => b.id === u.branchId)?.name || 'Main';
                    const isCurrent = u.id === currentUser.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setPinTargetUser(u);
                          setPinInput('');
                          setPinError('');
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors ${
                          isCurrent
                            ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {u.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {u.role} · {brName} · PIN <span className="font-mono">{u.pin}</span>
                          </div>
                        </div>
                        {isCurrent && (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            ) : (
              <form onSubmit={handleSwitchUserConfirm} className="mt-4 space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Enter PIN for <strong>{pinTargetUser.name}</strong> ({pinTargetUser.role}) — Hint:{' '}
                  <span className="font-mono font-semibold">{pinTargetUser.pin}</span>
                </p>
                <input
                  type="password"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter staff PIN"
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                  required
                />
                {pinError && <p className="text-xs font-medium text-rose-600">{pinError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPinTargetUser(null)}
                    className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-xs font-medium dark:border-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white"
                  >
                    Unlock Session
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm lg:bottom-6">
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
              toast.tone === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100'
                : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
            }`}
          >
            {toast.tone === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
            )}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
