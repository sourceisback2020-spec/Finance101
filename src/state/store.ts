import { create } from "zustand";
import { db } from "../data/db";
import {
  byCategory,
  calculateBudgetStatuses,
  calculateDashboardMetrics,
  calculateFinancialHealthScore,
  calculateGoalProgress,
  cashflowTransactions,
  cashflowSeries,
  categoryVarianceSeries,
  evaluateScenario,
  generateSpendingInsights,
  isAllowedImportedDate,
  localIsoDate,
  monthlySpendingTrend,
  netWorthSeries,
  postedTransactionsAsOf,
  scenarioImpactTransactions,
  spendingForecast
} from "../domain/calculations";
import type { BankAccount, Budget, CreditCard, DashboardMetrics, Goal, RetirementEntry, Scenario, Subscription, Transaction, UiPreferences } from "../domain/models";

type AppView = "dashboard" | "transactions" | "subscriptions" | "cards" | "banks" | "budgets" | "goals" | "scenarios" | "retirement" | "customize";

type Store = {
  view: AppView;
  loading: boolean;
  transactions: Transaction[];
  manualTransactions: Transaction[];
  subscriptions: Subscription[];
  cards: CreditCard[];
  banks: BankAccount[];
  budgets: Budget[];
  goals: Goal[];
  scenarios: Scenario[];
  retirementEntries: RetirementEntry[];
  uiPreferences: UiPreferences;
  metrics: DashboardMetrics;
  setView: (view: AppView) => void;
  refreshAll: () => Promise<void>;
  upsertTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  bulkInsertTransactions: (transactions: Transaction[]) => Promise<void>;
  upsertSubscription: (subscription: Subscription) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  upsertCard: (card: CreditCard) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  upsertScenario: (scenario: Scenario) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  upsertBank: (account: BankAccount) => Promise<void>;
  deleteBank: (id: string) => Promise<void>;
  upsertBudget: (budget: Budget) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  upsertGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  upsertRetirementEntry: (entry: RetirementEntry) => Promise<void>;
  deleteRetirementEntry: (id: string) => Promise<void>;
  updateUiPreferences: (prefs: Partial<UiPreferences>) => Promise<void>;
  exportCsv: () => Promise<boolean>;
  exportBackup: () => Promise<boolean>;
  importBackup: () => Promise<boolean>;
};

const emptyMetrics: DashboardMetrics = {
  income: 0,
  expenses: 0,
  netCashflow: 0,
  monthlySubscriptions: 0,
  totalCreditBalance: 0,
  bankCashPosition: 0,
  averageUtilizationPct: 0,
  retirementBalance: 0,
  retirementProjected12m: 0,
  savingsRatePct: 0,
  topMerchant: null,
  biggestExpenseCategory: null,
  daysUntilNextBill: null,
  nextBillName: null,
  nextBillAmount: null
};

const defaultUiPreferences: UiPreferences = {
  theme: "midnight",
  background: "aurora",
  density: "cozy",
  glassMode: true,
  motionEffects: true
};

export const useFinanceStore = create<Store>((set, get) => ({
  view: "dashboard",
  loading: false,
  transactions: [],
  manualTransactions: [],
  subscriptions: [],
  cards: [],
  banks: [],
  budgets: [],
  goals: [],
  scenarios: [],
  retirementEntries: [],
  uiPreferences: defaultUiPreferences,
  metrics: emptyMetrics,
  setView: (view) => set({ view }),
  refreshAll: async () => {
    set({ loading: true });
    const [rawManualTransactions, subscriptions, cards, banks, budgets, goals, scenarios, retirementEntries, uiPreferences] = await Promise.all([
      db.listTransactions(),
      db.listSubscriptions(),
      db.listCards(),
      db.listBanks(),
      db.listBudgets(),
      db.listGoals(),
      db.listScenarios(),
      db.listRetirementEntries(),
      db.getUiPreferences()
    ]);
    const manualTransactions = rawManualTransactions.filter(isAllowedImportedDate);
    const normalizedScenarios = scenarios.map((scenario) => ({
      ...scenario,
      accountId: scenario.accountId ?? "unassigned",
      scheduleDate: scenario.scheduleDate || localIsoDate(),
      isApplied: typeof scenario.isApplied === "number" ? scenario.isApplied : 0
    }));
    const normalizedSubscriptions = subscriptions.map((subscription) => ({
      ...subscription,
      accountId: subscription.accountId ?? "unassigned",
      imageDataUrl: subscription.imageDataUrl ?? ""
    }));
    const normalizedBanks = banks.map((bank) => ({
      ...bank,
      imageDataUrl: bank.imageDataUrl ?? ""
    }));
    const scenarioTransactions = scenarioImpactTransactions(normalizedScenarios);
    const transactions = [...manualTransactions, ...scenarioTransactions];
    set({
      loading: false,
      transactions,
      manualTransactions,
      subscriptions: normalizedSubscriptions,
      cards,
      banks: normalizedBanks,
      budgets,
      goals,
      scenarios: normalizedScenarios,
      retirementEntries,
      uiPreferences,
      metrics: calculateDashboardMetrics(transactions, normalizedSubscriptions, cards, retirementEntries, normalizedBanks)
    });
  },
  upsertTransaction: async (transaction) => {
    await db.upsertTransaction(transaction);
    await get().refreshAll();
  },
  deleteTransaction: async (id) => {
    await db.deleteTransaction(id);
    await get().refreshAll();
  },
  bulkInsertTransactions: async (transactions) => {
    await db.bulkInsertTransactions(transactions);
    await get().refreshAll();
  },
  upsertSubscription: async (subscription) => {
    await db.upsertSubscription(subscription);
    await get().refreshAll();
  },
  deleteSubscription: async (id) => {
    await db.deleteSubscription(id);
    await get().refreshAll();
  },
  upsertCard: async (card) => {
    await db.upsertCard(card);
    await get().refreshAll();
  },
  deleteCard: async (id) => {
    await db.deleteCard(id);
    await get().refreshAll();
  },
  upsertScenario: async (scenario) => {
    await db.upsertScenario(scenario);
    await get().refreshAll();
  },
  deleteScenario: async (id) => {
    await db.deleteScenario(id);
    await get().refreshAll();
  },
  upsertBank: async (account) => {
    await db.upsertBank(account);
    await get().refreshAll();
  },
  deleteBank: async (id) => {
    await db.deleteBank(id);
    await get().refreshAll();
  },
  upsertBudget: async (budget) => {
    await db.upsertBudget(budget);
    await get().refreshAll();
  },
  deleteBudget: async (id) => {
    await db.deleteBudget(id);
    await get().refreshAll();
  },
  upsertGoal: async (goal) => {
    await db.upsertGoal(goal);
    await get().refreshAll();
  },
  deleteGoal: async (id) => {
    await db.deleteGoal(id);
    await get().refreshAll();
  },
  upsertRetirementEntry: async (entry) => {
    await db.upsertRetirementEntry(entry);
    await get().refreshAll();
  },
  deleteRetirementEntry: async (id) => {
    await db.deleteRetirementEntry(id);
    await get().refreshAll();
  },
  updateUiPreferences: async (prefs) => {
    const merged = { ...get().uiPreferences, ...prefs };
    set({ uiPreferences: merged });
    await db.setUiPreferences(merged);
  },
  exportCsv: async () => db.exportTransactionsCsv(),
  exportBackup: async () => db.exportBackupJson(),
  importBackup: async () => {
    const ok = await db.importBackupJson();
    if (ok) {
      await get().refreshAll();
    }
    return ok;
  }
}));

export function useDashboardData() {
  const transactions = useFinanceStore((state) => state.transactions);
  const scenarios = useFinanceStore((state) => state.scenarios);
  const cards = useFinanceStore((state) => state.cards);
  const metrics = useFinanceStore((state) => state.metrics);
  const budgets = useFinanceStore((state) => state.budgets);
  const goals = useFinanceStore((state) => state.goals);
  const subscriptions = useFinanceStore((state) => state.subscriptions);
  const today = localIsoDate();
  const cashflowTransactionsAllDates = cashflowTransactions(transactions, cards);
  const postedTransactions = postedTransactionsAsOf(cashflowTransactionsAllDates, today);
  const banks = useFinanceStore((state) => state.banks);
  const retirementEntries = useFinanceStore((state) => state.retirementEntries);

  const trends = monthlySpendingTrend(cashflowTransactionsAllDates, 12);

  return {
    categorySpend: byCategory(postedTransactions),
    cashflow: cashflowSeries(cashflowTransactionsAllDates),
    scenarioOutcomes: scenarios.map((scenario) => ({
      name: scenario.name,
      ...evaluateScenario(scenario, metrics.netCashflow, metrics.monthlySubscriptions, cards)
    })),
    healthScore: calculateFinancialHealthScore(metrics),
    spendingPulse: categoryVarianceSeries(cashflowTransactionsAllDates),
    netWorth: netWorthSeries(transactions, banks, cards, retirementEntries),
    budgetStatuses: calculateBudgetStatuses(budgets, transactions, today),
    insights: generateSpendingInsights(cashflowTransactionsAllDates, budgets, subscriptions, today),
    monthlyTrends: trends,
    forecast: spendingForecast(monthlySpendingTrend(cashflowTransactionsAllDates, 6)),
    goalProgress: calculateGoalProgress(goals, banks, cards),
  };
}

