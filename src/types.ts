export type PermissionKey =
  | 'pos.sell'
  | 'pos.credit_sale'
  | 'pos.discount'
  | 'inventory.edit'
  | 'inventory.transfer'
  | 'inventory.view_cost'
  | 'invoices.edit'
  | 'invoices.toggle'
  | 'debt.collect'
  | 'branches.manage'
  | 'users.manage'
  | 'settings.manage'
  | 'ai.use';

export type StaffRole = 'Owner' | 'Pharmacist' | 'Branch Manager' | 'Cashier';

export type InvoiceTheme = 'emerald' | 'sapphire' | 'slate' | 'amber';
export type InvoiceLayout = 'detailed' | 'compact';
export type PaymentMethod = 'Cash' | 'Card' | 'Mobile Money' | 'Bank Transfer';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'VOID';

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  managerName: string;
  enabled: boolean;
  isPrimary: boolean;
  openingHours: string;
}

export interface BranchStockLot {
  quantity: number;
  reorderLevel: number;
  batchNumber: string;
  expiryDate: string;
}

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  sku: string;
  category: string;
  dosageForm: string;
  strength: string;
  unit: string;
  requiresRx: boolean;
  activeIngredient: string;
  clinicalNotes: string;
  costPrice: number;
  sellingPrice: number;
  enabled: boolean;
  branchStock: Record<string, BranchStockLot>;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  type: 'Walk-In' | 'Patient' | 'Clinic';
  creditLimit: number;
  currentDebt: number;
  enabled: boolean;
  notes: string;
  lastTransactionAt?: string;
}

export interface InvoiceItem {
  medicineId: string;
  name: string;
  strength: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  note: string;
  recordedBy: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  branchId: string;
  branchName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  cashierId: string;
  cashierName: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
  paymentHistory: PaymentRecord[];
  enabled: boolean;
  invoiceTheme: InvoiceTheme;
  invoiceLayout: InvoiceLayout;
  notes: string;
}

export interface StockTransfer {
  id: string;
  reference: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  batchNumber: string;
  status: 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  initiatedBy: string;
  notes: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  branchId: string;
  pin: string;
  avatarUrl?: string;
  enabled: boolean;
  permissions: Record<PermissionKey, boolean>;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  branchName: string;
  action: string;
  details: string;
}

export interface PharmacySettings {
  pharmacyName: string;
  tagline: string;
  licenseNumber: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  currencySymbol: string;
  currencyCode: string;
  taxRate: number;
  defaultInvoiceTheme: InvoiceTheme;
  defaultInvoiceLayout: InvoiceLayout;
  invoiceFooterNote: string;
  lowStockAlertEnabled: boolean;
  expiryWarningDays: number;
  allowCreditSales: boolean;
  requireRxVerification: boolean;
  themeMode: 'light' | 'dark';
  enabledModules: {
    aiAdvisor: boolean;
    debtLedger: boolean;
    multiBranch: boolean;
    smartInvoices: boolean;
  };
}

export interface PharmacyDatabase {
  branches: Branch[];
  medicines: Medicine[];
  customers: Customer[];
  invoices: Invoice[];
  transfers: StockTransfer[];
  users: StaffUser[];
  auditLogs: AuditLog[];
  settings: PharmacySettings;
}

export interface ClinicalAIResponse {
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH';
  summary: string;
  interactions: Array<{
    pair: string;
    severity: 'LOW' | 'MODERATE' | 'HIGH';
    explanation: string;
    recommendation: string;
  }>;
  counselingPoints: string[];
  alternativeSuggestions: Array<{
    medicineName: string;
    reason: string;
  }>;
}

export interface BusinessAIResponse {
  executiveSummary: string;
  restockPriorities: Array<{
    medicineName: string;
    branchName: string;
    suggestedOrderQty: number;
    urgency: 'CRITICAL' | 'SOON' | 'WATCH';
    rationale: string;
  }>;
  expiryActions: Array<{
    medicineName: string;
    branchName: string;
    expiryDate: string;
    recommendedAction: string;
  }>;
  debtInsights: Array<{
    customerName: string;
    outstandingBalance: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    collectionStrategy: string;
  }>;
  profitOpportunities: string[];
}
