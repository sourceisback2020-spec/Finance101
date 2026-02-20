import type {
  BankAccount,
  Budget,
  CreditCard,
  FinanceBackup,
  Goal,
  RetirementEntry,
  Scenario,
  Subscription,
  Transaction,
  UiPreferences
} from "../domain/models";
import { IMPORT_CUTOFF_DATE } from "../domain/calculations";
import { getHostedAccessToken, getHostedUser, invokeHostedFunction } from "./supabaseAuth";

function hasApi() {
  return typeof window !== "undefined" && typeof window.financeApi !== "undefined";
}

const defaultUiPreferences: UiPreferences = {
  theme: "midnight",
  background: "aurora",
  density: "cozy",
  glassMode: true,
  motionEffects: true
};
const BACKUP_FORMAT = "local-finance-backup";
const BACKUP_VERSION = 1;
const APPEARANCE_KEY = "appearance.engine.v1";
const APPEARANCE_PRESET_KEY = "appearance.engine.presets.v1";
const HOSTED_TABLE = import.meta.env.VITE_HOSTED_TABLE ?? "finance_records";
const HOSTED_OWNER_ID_FALLBACK = import.meta.env.VITE_HOSTED_OWNER_ID ?? "solo-user";
const HOSTED_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const HOSTED_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const HOSTED_MODE = import.meta.env.VITE_DATA_PROVIDER === "hosted";
const BANK_FEED_PROVIDER = (import.meta.env.VITE_BANK_FEED_PROVIDER ?? "").toLowerCase();
const BANK_FEED_ENABLED = BANK_FEED_PROVIDER === "plaid" || BANK_FEED_PROVIDER === "simplefin";
type BankFeedProvider = "none" | "plaid" | "simplefin";

type BankFeedLinkTokenResponse = {
  linkToken: string;
  expiration: string;
};

type BankFeedExchangeResponse = {
  connectionId: string;
  institutionName: string;
  accountsLinked: number;
};

type SimpleFinConnectResponse = {
  connectionId: string;
  institutionName: string;
  accountsLinked: number;
};

type BankFeedSyncResponse = {
  added: number;
  modified: number;
  removed: number;
  connections: number;
  syncedAt: string;
};

function hasHostedApi() {
  if (typeof window === "undefined") return false;
  if (!HOSTED_URL || !HOSTED_ANON_KEY) return false;
  return HOSTED_MODE || !hasApi();
}

async function hostedOwnerId() {
  const user = await getHostedUser();
  if (user?.id) return user.id;
  return HOSTED_OWNER_ID_FALLBACK;
}

async function hostedHeaders(withJson = false) {
  const token = await getHostedAccessToken();
  const headers: Record<string, string> = {
    apikey: HOSTED_ANON_KEY,
    Authorization: `Bearer ${token ?? HOSTED_ANON_KEY}`
  };
  if (withJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function hostedFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${HOSTED_URL}/rest/v1/${HOSTED_TABLE}${path}`, init);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hosted API error ${response.status}: ${errorText}`);
  }
  return response;
}

async function hostedList<T>(collection: string) {
  const ownerId = await hostedOwnerId();
  const params = new URLSearchParams();
  params.set("owner_id", `eq.${ownerId}`);
  params.set("collection", `eq.${collection}`);
  params.set("select", "data");
  params.set("order", "updated_at.desc");
  const response = await hostedFetch(`?${params.toString()}`, {
    method: "GET",
    headers: await hostedHeaders()
  });
  const rows = (await response.json()) as Array<{ data: T }>;
  return rows.map((row) => row.data);
}

async function hostedUpsert<T extends { id: string }>(collection: string, item: T) {
  const ownerId = await hostedOwnerId();
  await hostedFetch("?on_conflict=owner_id,collection,id", {
    method: "POST",
    headers: {
      ...(await hostedHeaders(true)),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([
      {
        owner_id: ownerId,
        collection,
        id: item.id,
        data: item
      }
    ])
  });
  return true;
}

async function hostedBulkUpsert<T extends { id: string }>(collection: string, items: T[]) {
  if (items.length === 0) return true;
  const ownerId = await hostedOwnerId();
  await hostedFetch("?on_conflict=owner_id,collection,id", {
    method: "POST",
    headers: {
      ...(await hostedHeaders(true)),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(
      items.map((item) => ({
        owner_id: ownerId,
        collection,
        id: item.id,
        data: item
      }))
    )
  });
  return true;
}

async function hostedDelete(collection: string, id: string) {
  const ownerId = await hostedOwnerId();
  const params = new URLSearchParams();
  params.set("owner_id", `eq.${ownerId}`);
  params.set("collection", `eq.${collection}`);
  params.set("id", `eq.${id}`);
  await hostedFetch(`?${params.toString()}`, {
    method: "DELETE",
    headers: await hostedHeaders()
  });
  return true;
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
}

function upsertById<T extends { id: string }>(list: T[], next: T) {
  const idx = list.findIndex((item) => item.id === next.id);
  if (idx === -1) return [...list, next];
  const copy = [...list];
  copy[idx] = next;
  return copy;
}

function deleteById<T extends { id: string }>(list: T[], id: string) {
  return list.filter((item) => item.id !== id);
}

function readUiPreferences(): UiPreferences {
  if (typeof window === "undefined") return defaultUiPreferences;
  try {
    const raw = window.localStorage.getItem("finance:uiPreferences");
    if (!raw) return defaultUiPreferences;
    return { ...defaultUiPreferences, ...(JSON.parse(raw) as Partial<UiPreferences>) };
  } catch {
    return defaultUiPreferences;
  }
}

function writeUiPreferences(prefs: UiPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("finance:uiPreferences", JSON.stringify(prefs));
}

function readOptionalLocalStorage(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeOptionalLocalStorage(key: string, value: string | null | undefined) {
  if (typeof window === "undefined" || typeof value === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, value);
}

function localDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function fallbackJsonDownload(content: string, fileName: string) {
  if (typeof window === "undefined") return false;
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  return true;
}

function readJsonFromPicker() {
  if (typeof window === "undefined") return Promise.resolve<string | null>(null);
  return new Promise<string | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(await file.text());
    };
    input.click();
  });
}

function normalizeImportedScenario(scenario: Scenario) {
  return {
    ...scenario,
    accountId: scenario.accountId ?? "unassigned",
    scheduleDate: scenario.scheduleDate || new Date().toISOString().slice(0, 10),
    isApplied: typeof scenario.isApplied === "number" ? scenario.isApplied : 0
  };
}

function parseBackupPayload(raw: string) {
  const parsed = JSON.parse(raw) as Partial<FinanceBackup>;
  if (parsed.format !== BACKUP_FORMAT || !parsed.data) {
    throw new Error("Invalid backup format");
  }
  const data = parsed.data;
  return {
    format: BACKUP_FORMAT,
    version: typeof parsed.version === "number" ? parsed.version : BACKUP_VERSION,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    appVersion: parsed.appVersion ?? "unknown",
    data: {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
      cards: Array.isArray(data.cards) ? data.cards : [],
      banks: Array.isArray(data.banks) ? data.banks : [],
      scenarios: Array.isArray(data.scenarios) ? data.scenarios.map(normalizeImportedScenario) : [],
      retirementEntries: Array.isArray(data.retirementEntries) ? data.retirementEntries : [],
      budgets: Array.isArray(data.budgets) ? data.budgets : [],
      goals: Array.isArray(data.goals) ? data.goals : [],
      uiPreferences: { ...defaultUiPreferences, ...(data.uiPreferences ?? {}) }
    },
    rendererSettings: parsed.rendererSettings
  } satisfies FinanceBackup;
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

function fallbackCsvExport(rows: Transaction[]) {
  if (typeof window === "undefined") return false;
  const csv = [
    "id,date,amount,type,category,merchant,account,note,recurring",
    ...rows.map((row) =>
      [
        row.id,
        row.date,
        row.amount,
        row.type,
        row.category,
        row.merchant,
        row.account,
        `"${String(row.note).replaceAll("\"", "\"\"")}"`,
        row.recurring
      ].join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "transactions-export.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  return true;
}

export const db = {
  listTransactions: async () => {
    if (hasApi()) return window.financeApi.listTransactions();
    if (hasHostedApi()) {
      try {
        return await hostedList<Transaction>("transactions");
      } catch (error) {
        console.error("Hosted listTransactions failed, using local fallback.", error);
      }
    }
    return readList<Transaction>("finance:transactions");
  },
  upsertTransaction: async (transaction: Transaction) => {
    if (hasApi()) return window.financeApi.upsertTransaction(transaction);
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("transactions", transaction);
      } catch (error) {
        console.error("Hosted upsertTransaction failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<Transaction>("finance:transactions"), transaction);
    writeList("finance:transactions", next);
    return true;
  },
  bulkInsertTransactions: async (transactions: Transaction[]) => {
    if (hasApi()) return window.financeApi.bulkInsertTransactions(transactions);
    if (hasHostedApi()) {
      try {
        return await hostedBulkUpsert("transactions", transactions);
      } catch (error) {
        console.error("Hosted bulkInsertTransactions failed, using local fallback.", error);
      }
    }
    let list = readList<Transaction>("finance:transactions");
    transactions.forEach((tx) => {
      list = upsertById(list, tx);
    });
    writeList("finance:transactions", list);
    return true;
  },
  deleteTransaction: async (id: string) => {
    if (hasApi()) return window.financeApi.deleteTransaction(id);
    if (hasHostedApi()) {
      try {
        return await hostedDelete("transactions", id);
      } catch (error) {
        console.error("Hosted deleteTransaction failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<Transaction>("finance:transactions"), id);
    writeList("finance:transactions", next);
    return true;
  },
  listSubscriptions: async () => {
    if (hasApi()) return window.financeApi.listSubscriptions();
    if (hasHostedApi()) {
      try {
        return await hostedList<Subscription>("subscriptions");
      } catch (error) {
        console.error("Hosted listSubscriptions failed, using local fallback.", error);
      }
    }
    return readList<Subscription>("finance:subscriptions");
  },
  upsertSubscription: async (subscription: Subscription) => {
    if (hasApi()) return window.financeApi.upsertSubscription(subscription);
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("subscriptions", subscription);
      } catch (error) {
        console.error("Hosted upsertSubscription failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<Subscription>("finance:subscriptions"), subscription);
    writeList("finance:subscriptions", next);
    return true;
  },
  deleteSubscription: async (id: string) => {
    if (hasApi()) return window.financeApi.deleteSubscription(id);
    if (hasHostedApi()) {
      try {
        return await hostedDelete("subscriptions", id);
      } catch (error) {
        console.error("Hosted deleteSubscription failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<Subscription>("finance:subscriptions"), id);
    writeList("finance:subscriptions", next);
    return true;
  },
  listCards: async () => {
    if (hasApi()) return window.financeApi.listCards();
    if (hasHostedApi()) {
      try {
        return await hostedList<CreditCard>("cards");
      } catch (error) {
        console.error("Hosted listCards failed, using local fallback.", error);
      }
    }
    return readList<CreditCard>("finance:cards");
  },
  upsertCard: async (card: CreditCard) => {
    if (hasApi()) return window.financeApi.upsertCard(card);
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("cards", card);
      } catch (error) {
        console.error("Hosted upsertCard failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<CreditCard>("finance:cards"), card);
    writeList("finance:cards", next);
    return true;
  },
  deleteCard: async (id: string) => {
    if (hasApi()) return window.financeApi.deleteCard(id);
    if (hasHostedApi()) {
      try {
        return await hostedDelete("cards", id);
      } catch (error) {
        console.error("Hosted deleteCard failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<CreditCard>("finance:cards"), id);
    writeList("finance:cards", next);
    return true;
  },
  listScenarios: async () => {
    if (hasApi()) return window.financeApi.listScenarios();
    if (hasHostedApi()) {
      try {
        return await hostedList<Scenario>("scenarios");
      } catch (error) {
        console.error("Hosted listScenarios failed, using local fallback.", error);
      }
    }
    return readList<Scenario>("finance:scenarios");
  },
  upsertScenario: async (scenario: Scenario) => {
    if (hasApi()) return window.financeApi.upsertScenario(scenario);
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("scenarios", scenario);
      } catch (error) {
        console.error("Hosted upsertScenario failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<Scenario>("finance:scenarios"), scenario);
    writeList("finance:scenarios", next);
    return true;
  },
  deleteScenario: async (id: string) => {
    if (hasApi()) return window.financeApi.deleteScenario(id);
    if (hasHostedApi()) {
      try {
        return await hostedDelete("scenarios", id);
      } catch (error) {
        console.error("Hosted deleteScenario failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<Scenario>("finance:scenarios"), id);
    writeList("finance:scenarios", next);
    return true;
  },
  listRetirementEntries: async () => {
    if (hasApi()) return window.financeApi.listRetirementEntries();
    if (hasHostedApi()) {
      try {
        return await hostedList<RetirementEntry>("retirementEntries");
      } catch (error) {
        console.error("Hosted listRetirementEntries failed, using local fallback.", error);
      }
    }
    return readList<RetirementEntry>("finance:retirementEntries");
  },
  upsertRetirementEntry: async (entry: RetirementEntry) => {
    if (hasApi()) return window.financeApi.upsertRetirementEntry(entry);
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("retirementEntries", entry);
      } catch (error) {
        console.error("Hosted upsertRetirementEntry failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<RetirementEntry>("finance:retirementEntries"), entry);
    writeList("finance:retirementEntries", next);
    return true;
  },
  deleteRetirementEntry: async (id: string) => {
    if (hasApi()) return window.financeApi.deleteRetirementEntry(id);
    if (hasHostedApi()) {
      try {
        return await hostedDelete("retirementEntries", id);
      } catch (error) {
        console.error("Hosted deleteRetirementEntry failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<RetirementEntry>("finance:retirementEntries"), id);
    writeList("finance:retirementEntries", next);
    return true;
  },
  listBudgets: async () => {
    if (hasHostedApi()) {
      try {
        return await hostedList<Budget>("budgets");
      } catch (error) {
        console.error("Hosted listBudgets failed, using local fallback.", error);
      }
    }
    return readList<Budget>("finance:budgets");
  },
  upsertBudget: async (budget: Budget) => {
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("budgets", budget);
      } catch (error) {
        console.error("Hosted upsertBudget failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<Budget>("finance:budgets"), budget);
    writeList("finance:budgets", next);
    return true;
  },
  deleteBudget: async (id: string) => {
    if (hasHostedApi()) {
      try {
        return await hostedDelete("budgets", id);
      } catch (error) {
        console.error("Hosted deleteBudget failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<Budget>("finance:budgets"), id);
    writeList("finance:budgets", next);
    return true;
  },
  listGoals: async () => {
    if (hasHostedApi()) {
      try {
        return await hostedList<Goal>("goals");
      } catch (error) {
        console.error("Hosted listGoals failed, using local fallback.", error);
      }
    }
    return readList<Goal>("finance:goals");
  },
  upsertGoal: async (goal: Goal) => {
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("goals", goal);
      } catch (error) {
        console.error("Hosted upsertGoal failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<Goal>("finance:goals"), goal);
    writeList("finance:goals", next);
    return true;
  },
  deleteGoal: async (id: string) => {
    if (hasHostedApi()) {
      try {
        return await hostedDelete("goals", id);
      } catch (error) {
        console.error("Hosted deleteGoal failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<Goal>("finance:goals"), id);
    writeList("finance:goals", next);
    return true;
  },
  listBanks: async () => {
    if (hasApi()) return window.financeApi.listBanks();
    if (hasHostedApi()) {
      try {
        return await hostedList<BankAccount>("banks");
      } catch (error) {
        console.error("Hosted listBanks failed, using local fallback.", error);
      }
    }
    return readList<BankAccount>("finance:banks");
  },
  upsertBank: async (account: BankAccount) => {
    if (hasApi()) return window.financeApi.upsertBank(account);
    if (hasHostedApi()) {
      try {
        return await hostedUpsert("banks", account);
      } catch (error) {
        console.error("Hosted upsertBank failed, using local fallback.", error);
      }
    }
    const next = upsertById(readList<BankAccount>("finance:banks"), account);
    writeList("finance:banks", next);
    return true;
  },
  deleteBank: async (id: string) => {
    if (hasApi()) return window.financeApi.deleteBank(id);
    if (hasHostedApi()) {
      try {
        return await hostedDelete("banks", id);
      } catch (error) {
        console.error("Hosted deleteBank failed, using local fallback.", error);
      }
    }
    const next = deleteById(readList<BankAccount>("finance:banks"), id);
    writeList("finance:banks", next);
    return true;
  },
  getBankFeedProvider: (): BankFeedProvider => {
    // Hosted mode: check for full backend availability
    if (hasHostedApi() && BANK_FEED_ENABLED) {
      if (BANK_FEED_PROVIDER === "plaid") return "plaid";
      if (BANK_FEED_PROVIDER === "simplefin") return "simplefin";
      return "none";
    }
    // Local/browser mode: SimpleFin works client-side via dev proxy
    if (BANK_FEED_PROVIDER === "simplefin") return "simplefin";
    return "none";
  },
  isBankFeedEnabled: () => {
    if (hasHostedApi() && BANK_FEED_ENABLED) return true;
    // SimpleFin available in local mode (client-side via dev proxy)
    return BANK_FEED_PROVIDER === "simplefin";
  },
  isHostedDataProvider: () => hasHostedApi(),
  createBankFeedLinkToken: async () => {
    if (!hasHostedApi() || !BANK_FEED_ENABLED) {
      throw new Error("Bank feeds are only available in hosted mode.");
    }
    return invokeHostedFunction<BankFeedLinkTokenResponse>("bank-feed-link-token");
  },
  exchangeBankFeedPublicToken: async (publicToken: string) => {
    if (!hasHostedApi() || !BANK_FEED_ENABLED) {
      throw new Error("Bank feeds are only available in hosted mode.");
    }
    return invokeHostedFunction<BankFeedExchangeResponse>("bank-feed-exchange", { publicToken });
  },
  connectSimpleFinBridge: async (setupToken: string) => {
    // Hosted mode: delegate to Supabase Edge Function
    if (hasHostedApi() && BANK_FEED_ENABLED) {
      return invokeHostedFunction<SimpleFinConnectResponse>("bank-feed-connect-simplefin", { setupToken });
    }
    // Local mode: client-side SimpleFin via dev proxy
    const { connectSimpleFinLocal } = await import("../services/simplefin/client");
    const result = await connectSimpleFinLocal(setupToken);
    // Only add NEW bank accounts — never overwrite existing ones so the
    // user's manually-set initial balance is preserved.
    let bankList = readList<BankAccount>("finance:banks");
    for (const bank of result.banks) {
      const exists = bankList.some((existing) => existing.id === bank.id);
      if (!exists) {
        bankList = [...bankList, bank];
      }
    }
    writeList("finance:banks", bankList);
    return {
      connectionId: result.connectionId,
      institutionName: result.institutionName,
      accountsLinked: result.accountsLinked,
    };
  },
  syncBankFeedTransactions: async () => {
    // Hosted mode: delegate to Supabase Edge Function
    if (hasHostedApi() && BANK_FEED_ENABLED) {
      return invokeHostedFunction<BankFeedSyncResponse>("bank-feed-sync");
    }
    // Local mode: client-side SimpleFin sync via dev proxy
    const { syncSimpleFinLocal } = await import("../services/simplefin/client");
    const result = await syncSimpleFinLocal();

    // Only add NEW bank accounts — never overwrite existing ones so the
    // user's manually-set initial balance is preserved.
    let bankList = readList<BankAccount>("finance:banks");
    for (const bank of result.banks) {
      const exists = bankList.some((existing) => existing.id === bank.id);
      if (!exists) {
        bankList = [...bankList, bank];
      }
    }
    writeList("finance:banks", bankList);

    // Persist transactions (upsert to avoid duplicates on re-sync)
    let txList = readList<Transaction>("finance:transactions");
    for (const tx of result.transactions) {
      txList = upsertById(txList, tx);
    }
    // Prune imported transactions before the cutoff date
    txList = txList.filter(
      (tx) => !tx.id.startsWith("bank-feed:") || tx.date >= IMPORT_CUTOFF_DATE
    );
    writeList("finance:transactions", txList);

    return {
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      connections: result.connections,
      syncedAt: result.syncedAt,
    };
  },
  getUiPreferences: async () => {
    if (hasApi()) return window.financeApi.getUiPreferences();
    if (hasHostedApi()) {
      try {
        const rows = await hostedList<UiPreferences>("settings");
        return rows[0] ?? defaultUiPreferences;
      } catch (error) {
        console.error("Hosted getUiPreferences failed, using local fallback.", error);
      }
    }
    return readUiPreferences();
  },
  setUiPreferences: async (prefs: UiPreferences) => {
    if (hasApi()) return window.financeApi.setUiPreferences(prefs);
    if (hasHostedApi()) {
      try {
        await hostedFetch("?on_conflict=owner_id,collection,id", {
          method: "POST",
          headers: {
            ...(await hostedHeaders(true)),
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify([
            {
              owner_id: await hostedOwnerId(),
              collection: "settings",
              id: "ui-preferences",
              data: prefs
            }
          ])
        });
        return true;
      } catch (error) {
        console.error("Hosted setUiPreferences failed, using local fallback.", error);
      }
    }
    writeUiPreferences(prefs);
    return true;
  },
  exportTransactionsCsv: async () => {
    if (hasApi()) return window.financeApi.exportTransactionsCsv();
    return fallbackCsvExport(await db.listTransactions());
  },
  exportBackupJson: async () => {
    const backup: FinanceBackup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: "0.0.0",
      data: {
        transactions: await db.listTransactions(),
        subscriptions: await db.listSubscriptions(),
        cards: await db.listCards(),
        banks: await db.listBanks(),
        scenarios: await db.listScenarios(),
        retirementEntries: await db.listRetirementEntries(),
        budgets: await db.listBudgets(),
        goals: await db.listGoals(),
        uiPreferences: await db.getUiPreferences()
      },
      rendererSettings: {
        appearance: readOptionalLocalStorage(APPEARANCE_KEY),
        appearancePresets: readOptionalLocalStorage(APPEARANCE_PRESET_KEY)
      }
    };
    const payload = JSON.stringify(backup, null, 2);
    if (hasApi()) {
      return window.financeApi.saveBackupJson(payload);
    }
    return fallbackJsonDownload(payload, `local-finance-backup-${localDateStamp()}.json`);
  },
  importBackupJson: async () => {
    const raw = hasApi() ? await window.financeApi.openBackupJson() : await readJsonFromPicker();
    if (!raw) return false;
    const backup = parseBackupPayload(raw);

    if (hasApi()) {
      await replaceCollection(db.listTransactions, db.deleteTransaction, db.upsertTransaction, backup.data.transactions);
      await replaceCollection(db.listSubscriptions, db.deleteSubscription, db.upsertSubscription, backup.data.subscriptions);
      await replaceCollection(db.listCards, db.deleteCard, db.upsertCard, backup.data.cards);
      await replaceCollection(db.listBanks, db.deleteBank, db.upsertBank, backup.data.banks);
      await replaceCollection(db.listScenarios, db.deleteScenario, db.upsertScenario, backup.data.scenarios);
      await replaceCollection(db.listRetirementEntries, db.deleteRetirementEntry, db.upsertRetirementEntry, backup.data.retirementEntries);
      await replaceCollection(db.listBudgets, db.deleteBudget, db.upsertBudget, backup.data.budgets);
      await replaceCollection(db.listGoals, db.deleteGoal, db.upsertGoal, backup.data.goals);
      await db.setUiPreferences(backup.data.uiPreferences);
    } else {
      writeList("finance:transactions", backup.data.transactions);
      writeList("finance:subscriptions", backup.data.subscriptions);
      writeList("finance:cards", backup.data.cards);
      writeList("finance:banks", backup.data.banks);
      writeList("finance:scenarios", backup.data.scenarios);
      writeList("finance:retirementEntries", backup.data.retirementEntries);
      writeList("finance:budgets", backup.data.budgets);
      writeList("finance:goals", backup.data.goals);
      writeUiPreferences(backup.data.uiPreferences);
    }

    writeOptionalLocalStorage(APPEARANCE_KEY, backup.rendererSettings?.appearance);
    writeOptionalLocalStorage(APPEARANCE_PRESET_KEY, backup.rendererSettings?.appearancePresets);
    return true;
  }
};

