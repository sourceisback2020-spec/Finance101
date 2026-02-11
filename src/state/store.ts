import { create } from "zustand";
import { db } from "../data/db";
import {
  byCategory,
  calculateDashboardMetrics,
  cashflowSeries,
  evaluateScenario,
  postedTransactionsAsOf,
  localIsoDate,
  scenarioImpactTransactions
} from "../domain/calculations";
import type { CreditCard, DashboardMetrics, RetirementEntry, Scenario, Subscription, Transaction } from "../domain/models";
import type { BankAccount, UiPreferences } from "../domain/models";

type AppView = "dashboard" | "transactions" | "subscriptions" | "cards" | "banks" | "scenarios" | "retirement" | "customize";

type Store = {
  view: AppView;
  loading: boolean;
  transactions: Transaction[];
  manualTransactions: Transaction[];
  subscriptions: Subscription[];
  cards: CreditCard[];
  banks: BankAccount[];
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
  retirementProjected12m: 0
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
  scenarios: [],
  retirementEntries: [],
  uiPreferences: defaultUiPreferences,
  metrics: emptyMetrics,
  setView: (view) => set({ view }),
  refreshAll: async () => {
    set({ loading: true });
    const [manualTransactions, subscriptions, cards, banks, scenarios, retirementEntries, uiPreferences] = await Promise.all([
      db.listTransactions(),
      db.listSubscriptions(),
      db.listCards(),
      db.listBanks(),
      db.listScenarios(),
      db.listRetirementEntries(),
      db.getUiPreferences()
    ]);
    const normalizedScenarios = scenarios.map((scenario) => ({
      ...scenario,
      accountId: scenario.accountId ?? "unassigned",
      scheduleDate: scenario.scheduleDate || localIsoDate(),
      isApplied: typeof scenario.isApplied === "number" ? scenario.isApplied : 0
    }));
    const scenarioTransactions = scenarioImpactTransactions(normalizedScenarios);
    const transactions = [...manualTransactions, ...scenarioTransactions];
    set({
      loading: false,
      transactions,
      manualTransactions,
      subscriptions,
      cards,
      banks,
      scenarios: normalizedScenarios,
      retirementEntries,
      uiPreferences,
      metrics: calculateDashboardMetrics(transactions, subscriptions, cards, retirementEntries, banks)
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
  const today = localIsoDate();
  const postedTransactions = postedTransactionsAsOf(transactions, today);
  return {
    categorySpend: byCategory(postedTransactions),
    cashflow: cashflowSeries(postedTransactions),
    scenarioOutcomes: scenarios.map((scenario) => ({
      name: scenario.name,
      ...evaluateScenario(scenario, metrics.netCashflow, metrics.monthlySubscriptions, cards)
    }))
  };
}

