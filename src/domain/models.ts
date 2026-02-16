export type TransactionType = "income" | "expense";
export type SubscriptionFrequency = "monthly" | "quarterly" | "yearly";
export type ScenarioPaymentType = "cash" | "card";
export type BankAccountType = "checking" | "savings" | "brokerage" | "cash";
export type ThemePreset = "midnight" | "emerald" | "sunset";
export type DensityPreset = "cozy" | "compact";
export type BackgroundPreset = "aurora" | "mesh" | "orbital" | "topography";

export type Transaction = {
  id: string;
  date: string;
  amount: number;
  type: TransactionType;
  category: string;
  merchant: string;
  account: string;
  note: string;
  recurring: number;
};

export type Subscription = {
  id: string;
  name: string;
  cost: number;
  frequency: SubscriptionFrequency;
  nextDueDate: string;
  category: string;
  accountId: string;
  imageDataUrl: string;
  isActive: number;
};

export type CreditCard = {
  id: string;
  name: string;
  balance: number;
  limitAmount: number;
  apr: number;
  minPayment: number;
  dueDate: string;
};

export type Scenario = {
  id: string;
  name: string;
  purchaseAmount: number;
  durationMonths: number;
  paymentType: ScenarioPaymentType;
  createdAt: string;
  accountId: string;
  scheduleDate: string;
  isApplied: number;
};

export type RetirementEntry = {
  id: string;
  date: string;
  employeeContribution: number;
  employerMatch: number;
  balance: number;
  annualReturn: number;
};

export type BankAccount = {
  id: string;
  institution: string;
  nickname: string;
  type: BankAccountType;
  currentBalance: number;
  availableBalance: number;
  apy: number;
  lastUpdated: string;
  imageDataUrl: string;
};

export type UiPreferences = {
  theme: ThemePreset;
  background: BackgroundPreset;
  density: DensityPreset;
  glassMode: boolean;
  motionEffects: boolean;
};

export type DashboardMetrics = {
  income: number;
  expenses: number;
  netCashflow: number;
  monthlySubscriptions: number;
  totalCreditBalance: number;
  bankCashPosition: number;
  averageUtilizationPct: number;
  retirementBalance: number;
  retirementProjected12m: number;
};

export type HealthSubScore = {
  label: string;
  value: number;
  weight: number;
  weighted: number;
  rating: "good" | "fair" | "poor";
};

export type FinancialHealthScore = {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  breakdown: HealthSubScore[];
};

export type CategoryVariance = {
  category: string;
  current: number;
  previous: number;
  change: number;
  changePct: number;
  anomaly: boolean;
};

export type NetWorthPoint = {
  month: string;
  assets: number;
  liabilities: number;
  net: number;
};

export type FinanceBackup = {
  format: "local-finance-backup";
  version: number;
  exportedAt: string;
  appVersion: string;
  data: {
    transactions: Transaction[];
    subscriptions: Subscription[];
    cards: CreditCard[];
    banks: BankAccount[];
    scenarios: Scenario[];
    retirementEntries: RetirementEntry[];
    uiPreferences: UiPreferences;
  };
  rendererSettings?: {
    appearance?: string | null;
    appearancePresets?: string | null;
  };
};

