import type {
  BusinessAIResponse,
  ClinicalAIResponse,
  Invoice,
  PaymentStatus,
  PharmacyDatabase,
} from '../types';

export class ApiClient {
  private userId: string = 'usr-owner';

  setUserId(id: string) {
    this.userId = id;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': this.userId,
      ...(options.headers as Record<string, string> | undefined),
    };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as T;
  }

  bootstrap(): Promise<PharmacyDatabase> {
    return this.request<PharmacyDatabase>('/api/bootstrap');
  }

  createInvoice(payload: unknown): Promise<{ invoice: Invoice; db: PharmacyDatabase }> {
    return this.request('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateInvoice(id: string, payload: unknown): Promise<{ invoice: Invoice; db: PharmacyDatabase }> {
    return this.request(`/api/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  toggleInvoice(id: string): Promise<{ invoice: Invoice; db: PharmacyDatabase }> {
    return this.request(`/api/invoices/${id}/toggle`, {
      method: 'POST',
    });
  }

  recordInvoicePayment(
    id: string,
    payload: { amount: number; method: string; note?: string }
  ): Promise<{ invoice: Invoice; db: PharmacyDatabase }> {
    return this.request(`/api/invoices/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  payCustomerDebt(
    customerId: string,
    payload: { amount: number; method: string; note?: string }
  ): Promise<{ totalApplied: number; db: PharmacyDatabase }> {
    return this.request(`/api/customers/${customerId}/pay-debt`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  createCustomer(payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateCustomer(id: string, payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  createMedicine(payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request('/api/medicines', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateMedicine(id: string, payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request(`/api/medicines/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  toggleMedicine(id: string): Promise<{ db: PharmacyDatabase }> {
    return this.request(`/api/medicines/${id}/toggle`, { method: 'POST' });
  }

  createTransfer(payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request('/api/transfers', { method: 'POST', body: JSON.stringify(payload) });
  }

  createBranch(payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request('/api/branches', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateBranch(id: string, payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request(`/api/branches/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  createUser(payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request('/api/users', { method: 'POST', body: JSON.stringify(payload) });
  }

  updateUser(id: string, payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  updateSettings(payload: unknown): Promise<{ db: PharmacyDatabase }> {
    return this.request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
  }

  clinicalCheck(payload: {
    items: Array<{
      name: string;
      genericName: string;
      strength: string;
      activeIngredient: string;
      quantity: number;
    }>;
    patientContext?: string;
  }): Promise<ClinicalAIResponse> {
    return this.request('/api/ai/clinical-check', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  businessInsights(branchId: string): Promise<BusinessAIResponse> {
    return this.request('/api/ai/business-insights', {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
  }

  askCopilot(question: string, branchId: string): Promise<{ answer: string }> {
    return this.request('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, branchId }),
    });
  }
}

export const api = new ApiClient();

export function formatMoney(amount: number, symbol = '$'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${safe.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatShortDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return 9999;
  const diffMs = target.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getPaymentStatusMeta(status: PaymentStatus): {
  label: string;
  textClass: string;
  surfaceClass: string;
} {
  switch (status) {
    case 'PAID':
      return {
        label: 'Paid in Full',
        textClass: 'text-emerald-700 dark:text-emerald-400',
        surfaceClass: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800',
      };
    case 'PARTIAL':
      return {
        label: 'Partial Payment',
        textClass: 'text-amber-700 dark:text-amber-400',
        surfaceClass: 'bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800',
      };
    case 'UNPAID':
      return {
        label: 'Unpaid Credit',
        textClass: 'text-rose-700 dark:text-rose-400',
        surfaceClass: 'bg-rose-50 border-rose-200 dark:bg-rose-950/50 dark:border-rose-800',
      };
    case 'VOID':
      return {
        label: 'Disabled / Void',
        textClass: 'text-slate-500 dark:text-slate-400',
        surfaceClass: 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700',
      };
  }
}
