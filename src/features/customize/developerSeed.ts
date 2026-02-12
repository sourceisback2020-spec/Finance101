import { db } from "../../data/db";
import { localIsoDate } from "../../domain/calculations";
import type { BankAccount, CreditCard, RetirementEntry, Scenario, Subscription, Transaction, UiPreferences } from "../../domain/models";

type SeedSnapshot = {
  transactions: Transaction[];
  subscriptions: Subscription[];
  cards: CreditCard[];
  banks: BankAccount[];
  scenarios: Scenario[];
  retirementEntries: RetirementEntry[];
  uiPreferences: UiPreferences;
};

const DEV_SEED_ENABLED_KEY = "developer.seed.enabled.v1";
const DEV_SEED_SNAPSHOT_KEY = "developer.seed.snapshot.v1";

function isoDateFromToday(dayOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return localIsoDate(date);
}

async function replaceCollection<T extends { id: string }>(
  existing: () => Promise<T[]>,
  remove: (id: string) => Promise<boolean>,
  upsert: (item: T) => Promise<boolean>,
  next: T[]
) {
  const current = await existing();
  await Promise.all(current.map((item) => remove(item.id)));
  await Promise.all(next.map((item) => upsert(item)));
}

function buildSeedData(): SeedSnapshot {
  const banks: BankAccount[] = [
    {
      id: "seed-bank-checking",
      institution: "Chase",
      nickname: "Main Checking",
      type: "checking",
      currentBalance: 3480.65,
      availableBalance: 3412.19,
      apy: 0.01,
      lastUpdated: isoDateFromToday(0),
      imageDataUrl: ""
    },
    {
      id: "seed-bank-savings",
      institution: "Ally",
      nickname: "Emergency Savings",
      type: "savings",
      currentBalance: 11250.34,
      availableBalance: 11250.34,
      apy: 4.2,
      lastUpdated: isoDateFromToday(0),
      imageDataUrl: ""
    },
    {
      id: "seed-bank-brokerage",
      institution: "Fidelity",
      nickname: "Cash Management",
      type: "brokerage",
      currentBalance: 2850.0,
      availableBalance: 2850.0,
      apy: 2.1,
      lastUpdated: isoDateFromToday(-1),
      imageDataUrl: ""
    }
  ];

  const cards: CreditCard[] = [
    {
      id: "seed-card-amex-gold",
      name: "Amex Gold",
      balance: 1840.55,
      limitAmount: 7000,
      apr: 24.99,
      minPayment: 72,
      dueDate: isoDateFromToday(11)
    },
    {
      id: "seed-card-visa-citi",
      name: "Citi Double Cash",
      balance: 920.2,
      limitAmount: 5000,
      apr: 19.5,
      minPayment: 35,
      dueDate: isoDateFromToday(17)
    }
  ];

  const subscriptions: Subscription[] = [
    {
      id: "seed-sub-netflix",
      name: "Netflix",
      cost: 15.49,
      frequency: "monthly",
      nextDueDate: isoDateFromToday(8),
      category: "Streaming",
      accountId: "seed-card-visa-citi",
      imageDataUrl: "",
      isActive: 1
    },
    {
      id: "seed-sub-spotify",
      name: "Spotify",
      cost: 11.99,
      frequency: "monthly",
      nextDueDate: isoDateFromToday(4),
      category: "Music",
      accountId: "seed-card-visa-citi",
      imageDataUrl: "",
      isActive: 1
    },
    {
      id: "seed-sub-gym",
      name: "Gym Membership",
      cost: 39.99,
      frequency: "monthly",
      nextDueDate: isoDateFromToday(12),
      category: "Health",
      accountId: "seed-bank-checking",
      imageDataUrl: "",
      isActive: 1
    },
    {
      id: "seed-sub-icloud",
      name: "iCloud+",
      cost: 2.99,
      frequency: "monthly",
      nextDueDate: isoDateFromToday(15),
      category: "Storage",
      accountId: "seed-card-visa-citi",
      imageDataUrl: "",
      isActive: 1
    },
    {
      id: "seed-sub-prime",
      name: "Amazon Prime",
      cost: 139,
      frequency: "yearly",
      nextDueDate: isoDateFromToday(132),
      category: "Shopping",
      accountId: "seed-bank-checking",
      imageDataUrl: "",
      isActive: 1
    }
  ];

  const transactions: Transaction[] = [
    {
      id: "seed-tx-paycheck-1",
      date: isoDateFromToday(-26),
      amount: 2450,
      type: "income",
      category: "Salary",
      merchant: "Employer Payroll",
      account: "seed-bank-checking",
      note: "Bi-weekly paycheck",
      recurring: 1
    },
    {
      id: "seed-tx-paycheck-2",
      date: isoDateFromToday(-12),
      amount: 2450,
      type: "income",
      category: "Salary",
      merchant: "Employer Payroll",
      account: "seed-bank-checking",
      note: "Bi-weekly paycheck",
      recurring: 1
    },
    {
      id: "seed-tx-rent",
      date: isoDateFromToday(-10),
      amount: 1380,
      type: "expense",
      category: "Housing",
      merchant: "Rent Payment",
      account: "seed-bank-checking",
      note: "Monthly rent",
      recurring: 1
    },
    {
      id: "seed-tx-groceries-1",
      date: isoDateFromToday(-9),
      amount: 126.42,
      type: "expense",
      category: "Groceries",
      merchant: "Trader Joe's",
      account: "seed-card-amex-gold",
      note: "",
      recurring: 0
    },
    {
      id: "seed-tx-groceries-2",
      date: isoDateFromToday(-3),
      amount: 98.35,
      type: "expense",
      category: "Groceries",
      merchant: "Costco",
      account: "seed-card-visa-citi",
      note: "",
      recurring: 0
    },
    {
      id: "seed-tx-gas-1",
      date: isoDateFromToday(-8),
      amount: 49.77,
      type: "expense",
      category: "Transportation",
      merchant: "Shell",
      account: "seed-card-visa-citi",
      note: "",
      recurring: 0
    },
    {
      id: "seed-tx-gas-2",
      date: isoDateFromToday(-1),
      amount: 45.1,
      type: "expense",
      category: "Transportation",
      merchant: "Exxon",
      account: "seed-card-visa-citi",
      note: "",
      recurring: 0
    },
    {
      id: "seed-tx-dining-1",
      date: isoDateFromToday(-7),
      amount: 38.9,
      type: "expense",
      category: "Dining",
      merchant: "Chipotle",
      account: "seed-card-amex-gold",
      note: "Lunch",
      recurring: 0
    },
    {
      id: "seed-tx-dining-2",
      date: isoDateFromToday(-2),
      amount: 54.23,
      type: "expense",
      category: "Dining",
      merchant: "Local Pizza",
      account: "seed-card-amex-gold",
      note: "Dinner",
      recurring: 0
    },
    {
      id: "seed-tx-utilities",
      date: isoDateFromToday(-6),
      amount: 121.64,
      type: "expense",
      category: "Utilities",
      merchant: "Electric + Water",
      account: "seed-bank-checking",
      note: "",
      recurring: 1
    },
    {
      id: "seed-tx-insurance",
      date: isoDateFromToday(-5),
      amount: 132.0,
      type: "expense",
      category: "Insurance",
      merchant: "Auto Insurance",
      account: "seed-bank-checking",
      note: "",
      recurring: 1
    },
    {
      id: "seed-tx-phone",
      date: isoDateFromToday(-4),
      amount: 76.11,
      type: "expense",
      category: "Phone",
      merchant: "Mobile Provider",
      account: "seed-bank-checking",
      note: "",
      recurring: 1
    },
    {
      id: "seed-tx-streaming",
      date: isoDateFromToday(-11),
      amount: 15.49,
      type: "expense",
      category: "Streaming",
      merchant: "Netflix",
      account: "seed-card-visa-citi",
      note: "",
      recurring: 1
    },
    {
      id: "seed-tx-spotify",
      date: isoDateFromToday(-16),
      amount: 11.99,
      type: "expense",
      category: "Music",
      merchant: "Spotify",
      account: "seed-card-visa-citi",
      note: "",
      recurring: 1
    },
    {
      id: "seed-tx-401k",
      date: isoDateFromToday(-12),
      amount: 400,
      type: "expense",
      category: "Retirement",
      merchant: "401k Contribution",
      account: "seed-bank-checking",
      note: "Payroll contribution",
      recurring: 1
    },
    {
      id: "seed-tx-interest",
      date: isoDateFromToday(-1),
      amount: 14.88,
      type: "income",
      category: "Interest",
      merchant: "Ally Savings",
      account: "seed-bank-savings",
      note: "Monthly APY payout",
      recurring: 1
    },
    {
      id: "seed-tx-transfer-out",
      date: isoDateFromToday(-13),
      amount: 300,
      type: "expense",
      category: "Transfer",
      merchant: "Internal Transfer",
      account: "seed-bank-checking",
      note: "To Emergency Savings",
      recurring: 0
    },
    {
      id: "seed-tx-transfer-in",
      date: isoDateFromToday(-13),
      amount: 300,
      type: "income",
      category: "Transfer",
      merchant: "Internal Transfer",
      account: "seed-bank-savings",
      note: "From Main Checking",
      recurring: 0
    },
    {
      id: "seed-tx-future-paycheck",
      date: isoDateFromToday(2),
      amount: 2450,
      type: "income",
      category: "Salary",
      merchant: "Employer Payroll",
      account: "seed-bank-checking",
      note: "Scheduled paycheck",
      recurring: 1
    }
  ];

  const scenarios: Scenario[] = [
    {
      id: "seed-scenario-laptop",
      name: "New Work Laptop",
      purchaseAmount: 1800,
      durationMonths: 12,
      paymentType: "card",
      createdAt: isoDateFromToday(-2),
      accountId: "seed-card-amex-gold",
      scheduleDate: isoDateFromToday(7),
      isApplied: 1
    },
    {
      id: "seed-scenario-vacation",
      name: "Summer Vacation",
      purchaseAmount: 2400,
      durationMonths: 6,
      paymentType: "cash",
      createdAt: isoDateFromToday(-3),
      accountId: "seed-bank-checking",
      scheduleDate: isoDateFromToday(45),
      isApplied: 0
    }
  ];

  const retirementEntries: RetirementEntry[] = [
    {
      id: "seed-ret-1",
      date: isoDateFromToday(-150),
      employeeContribution: 400,
      employerMatch: 200,
      balance: 14200,
      annualReturn: 7.2
    },
    {
      id: "seed-ret-2",
      date: isoDateFromToday(-120),
      employeeContribution: 400,
      employerMatch: 200,
      balance: 15170,
      annualReturn: 7.2
    },
    {
      id: "seed-ret-3",
      date: isoDateFromToday(-90),
      employeeContribution: 400,
      employerMatch: 200,
      balance: 16100,
      annualReturn: 7.2
    },
    {
      id: "seed-ret-4",
      date: isoDateFromToday(-60),
      employeeContribution: 400,
      employerMatch: 200,
      balance: 17035,
      annualReturn: 7.2
    },
    {
      id: "seed-ret-5",
      date: isoDateFromToday(-30),
      employeeContribution: 400,
      employerMatch: 200,
      balance: 17995,
      annualReturn: 7.2
    },
    {
      id: "seed-ret-6",
      date: isoDateFromToday(0),
      employeeContribution: 400,
      employerMatch: 200,
      balance: 18960,
      annualReturn: 7.2
    }
  ];

  return {
    transactions,
    subscriptions,
    cards,
    banks,
    scenarios,
    retirementEntries,
    uiPreferences: {
      theme: "midnight",
      background: "aurora",
      density: "cozy",
      glassMode: true,
      motionEffects: true
    }
  };
}

async function readCurrentSnapshot(): Promise<SeedSnapshot> {
  const [transactions, subscriptions, cards, banks, scenarios, retirementEntries, uiPreferences] = await Promise.all([
    db.listTransactions(),
    db.listSubscriptions(),
    db.listCards(),
    db.listBanks(),
    db.listScenarios(),
    db.listRetirementEntries(),
    db.getUiPreferences()
  ]);
  return { transactions, subscriptions, cards, banks, scenarios, retirementEntries, uiPreferences };
}

async function applySnapshot(snapshot: SeedSnapshot) {
  await replaceCollection(db.listTransactions, db.deleteTransaction, db.upsertTransaction, snapshot.transactions);
  await replaceCollection(db.listSubscriptions, db.deleteSubscription, db.upsertSubscription, snapshot.subscriptions);
  await replaceCollection(db.listCards, db.deleteCard, db.upsertCard, snapshot.cards);
  await replaceCollection(db.listBanks, db.deleteBank, db.upsertBank, snapshot.banks);
  await replaceCollection(db.listScenarios, db.deleteScenario, db.upsertScenario, snapshot.scenarios);
  await replaceCollection(db.listRetirementEntries, db.deleteRetirementEntry, db.upsertRetirementEntry, snapshot.retirementEntries);
  await db.setUiPreferences(snapshot.uiPreferences);
}

function readLocalStorage(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeLocalStorage(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, value);
}

export function isDeveloperSeedEnabled() {
  return readLocalStorage(DEV_SEED_ENABLED_KEY) === "1";
}

export async function enableDeveloperSeedData() {
  const snapshot = await readCurrentSnapshot();
  writeLocalStorage(DEV_SEED_SNAPSHOT_KEY, JSON.stringify(snapshot));
  await applySnapshot(buildSeedData());
  writeLocalStorage(DEV_SEED_ENABLED_KEY, "1");
}

export async function disableDeveloperSeedData() {
  const raw = readLocalStorage(DEV_SEED_SNAPSHOT_KEY);
  if (!raw) {
    writeLocalStorage(DEV_SEED_ENABLED_KEY, null);
    return;
  }
  const snapshot = JSON.parse(raw) as SeedSnapshot;
  await applySnapshot(snapshot);
  writeLocalStorage(DEV_SEED_ENABLED_KEY, null);
  writeLocalStorage(DEV_SEED_SNAPSHOT_KEY, null);
}


