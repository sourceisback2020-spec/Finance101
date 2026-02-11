import type { BankAccount, CreditCard, RetirementEntry, Scenario, Subscription, Transaction, UiPreferences } from "../domain/models";

type FinanceApi = {
  listTransactions: () => Promise<Transaction[]>;
  upsertTransaction: (transaction: Transaction) => Promise<boolean>;
  bulkInsertTransactions: (transactions: Transaction[]) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
  listSubscriptions: () => Promise<Subscription[]>;
  upsertSubscription: (subscription: Subscription) => Promise<boolean>;
  deleteSubscription: (id: string) => Promise<boolean>;
  listCards: () => Promise<CreditCard[]>;
  upsertCard: (card: CreditCard) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  listScenarios: () => Promise<Scenario[]>;
  upsertScenario: (scenario: Scenario) => Promise<boolean>;
  deleteScenario: (id: string) => Promise<boolean>;
  listRetirementEntries: () => Promise<RetirementEntry[]>;
  upsertRetirementEntry: (entry: RetirementEntry) => Promise<boolean>;
  deleteRetirementEntry: (id: string) => Promise<boolean>;
  listBanks: () => Promise<BankAccount[]>;
  upsertBank: (account: BankAccount) => Promise<boolean>;
  deleteBank: (id: string) => Promise<boolean>;
  getUiPreferences: () => Promise<UiPreferences>;
  setUiPreferences: (prefs: UiPreferences) => Promise<boolean>;
  exportTransactionsCsv: () => Promise<boolean>;
  saveBackupJson: (payload: string) => Promise<boolean>;
  openBackupJson: () => Promise<string | null>;
};

declare global {
  interface Window {
    financeApi: FinanceApi;
  }
}

export {};

