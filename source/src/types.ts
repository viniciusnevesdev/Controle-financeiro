export type TransactionKind = "expense" | "income" | "transfer";
export type TransactionSource = "manual" | "csv" | "ofx" | "installment";
export type AccountType = "checking" | "savings" | "cash" | "investment" | "credit";
export type PaymentMethod = "pix" | "debit" | "credit" | "cash" | "transfer" | "other";

export type Category = {
  id: string;
  name: string;
  icon: string;
  tone: string;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  color: string;
  creditLimit?: number;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  description: string;
  place?: string;
  originalDescription?: string;
  needsReview?: boolean;
  amount: number;
  date: string;
  time: string;
  categoryId: string;
  accountId: string;
  destinationAccountId?: string;
  paymentMethod: PaymentMethod;
  notes: string;
  source: TransactionSource;
  importFingerprint?: string;
  recurrenceGroup?: string;
  installment?: {
    current: number;
    total: number;
  };
};

export type Budget = {
  id: string;
  categoryId: string;
  limit: number;
};

export type Goal = {
  id: string;
  name: string;
  current: number;
  target: number;
  dueDate?: string;
};

export type CategoryRule = {
  id: string;
  keyword: string;
  categoryId: string;
  place?: string;
  matchMode?: "contains" | "startsWith" | "exact" | "simplified";
};

export type AppSettings = {
  hiddenValues: boolean;
  diagnosticsEnabled: boolean;
  diagnosticMaxCards: number;
  diagnosticSensitivity: "low" | "balanced" | "high";
  diagnosticSamePeriod: boolean;
  diagnosticIncomeTrends: boolean;
  diagnosticExpenseTrends: boolean;
  diagnosticCategoryTrends: boolean;
  diagnosticBudgetPace: boolean;
  diagnosticProjections: boolean;
  diagnosticBillAlerts: boolean;
  diagnosticSmallExpenses: boolean;
  diagnosticShowPositive: boolean;
  diagnosticShowWarnings: boolean;
  diagnosticShowNeutral: boolean;
  energyExpectedMax: number;
  smallExpenseLimit: number;
  smallExpenseCount: number;
  incomeComparisonMonths: number;
  expenseComparisonMonths: number;
  theme: "light" | "dark" | "system";
  incomeColor: string;
  expenseColor: string;
  navCustomEnabled: boolean;
  navShowLabels: boolean;
  navIconSize: number;
  navTextSize: number;
  navHeight: number;
  navCornerRadius: number;
  navBorderWidth: number;
  navSideInset: number;
  navShadow: "none" | "soft" | "strong";
  navBackgroundColor: string;
  navBorderColor: string;
  navInactiveColor: string;
  navActiveBackgroundColor: string;
  navActiveColor: string;
  navAddBackgroundColor: string;
};

export type AppState = {
  version: number;
  demoMode: boolean;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  rules: CategoryRule[];
  settings: AppSettings;
};

export type ImportCandidate = {
  tempId: string;
  selected: boolean;
  duplicate: boolean;
  kind: "expense" | "income";
  description: string;
  place: string;
  originalDescription: string;
  needsReview: boolean;
  confidence: "certain" | "suggested" | "unknown";
  rememberRule: boolean;
  pattern: string;
  amount: number;
  date: string;
  time: string;
  categoryId: string;
  accountId: string;
  source: "csv" | "ofx";
  fingerprint: string;
};

export type Diagnostic = {
  id: string;
  title: string;
  message: string;
  tone: "positive" | "warning" | "neutral";
  icon: string;
  priority: number;
};
