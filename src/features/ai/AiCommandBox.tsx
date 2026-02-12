import { useMemo, useState } from "react";
import { db } from "../../data/db";
import { localIsoDate } from "../../domain/calculations";
import type { BankAccount, CreditCard, RetirementEntry, Scenario, Subscription, Transaction } from "../../domain/models";
import { clearScheduledChargesForSubscription, syncScheduledChargesForSubscription } from "../../services/subscriptions/scheduledCharges";
import { useFinanceStore } from "../../state/store";

type ParseContext = {
  banks: BankAccount[];
  cards: CreditCard[];
  subscriptions: Subscription[];
  scenarios: Scenario[];
  retirementEntries: RetirementEntry[];
};

type ParsedAction = {
  label: string;
  run: () => Promise<void>;
};

const STOP_WORDS = [
  "on", "date", "note", "category", "merchant", "source", "from", "to", "into", "account",
  "balance", "available", "apy", "type", "institution", "nickname", "limit", "apr", "min",
  "due", "cost", "frequency", "amount", "months", "duration", "payment", "schedule", "employee", "match", "return"
];

function parseAmount(input: string) {
  const moneyMatch = input.match(/\$(-?\d+(?:\.\d{1,2})?)/);
  if (moneyMatch) return Math.abs(Number(moneyMatch[1]));
  const genericMatches = [...input.matchAll(/(-?\d+(?:\.\d{1,2})?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && Math.abs(value) < 1_000_000);
  return genericMatches.length > 0 ? Math.abs(genericMatches[0]) : 0;
}

function parseDate(input: string) {
  const lower = input.toLowerCase();
  if (/\btoday\b/.test(lower)) return localIsoDate();
  if (/\btomorrow\b/.test(lower)) {
    const base = new Date();
    base.setDate(base.getDate() + 1);
    return localIsoDate(base);
  }
  const dateMatch = input.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return dateMatch?.[0] ?? localIsoDate();
}

function nextCycleDate(frequency: Subscription["frequency"]) {
  const base = new Date();
  const monthsToAdd = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  base.setMonth(base.getMonth() + monthsToAdd);
  return localIsoDate(base);
}

function parseSubscriptionDueDate(input: string, frequency: Subscription["frequency"]) {
  const dueField = parseField(input, ["due"]);
  if (dueField) return dueField;
  if (/\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b/i.test(input)) {
    return parseDate(input);
  }
  return nextCycleDate(frequency);
}

function parseNumberByKey(input: string, keys: string[]) {
  for (const key of keys) {
    const match = input.match(new RegExp(`\\b${key}\\b\\s+\\$?(-?\\d+(?:\\.\\d{1,2})?)`, "i"));
    if (match) return Number(match[1]);
  }
  return undefined;
}

function parseWordByKey(input: string, keys: string[]) {
  for (const key of keys) {
    const match = input.match(new RegExp(`\\b${key}\\b\\s+([a-zA-Z-]+)`, "i"));
    if (match?.[1]) return match[1].toLowerCase();
  }
  return undefined;
}

function parseField(input: string, names: string[]) {
  for (const name of names) {
    const pattern = new RegExp(`${name}\\s+(.+?)(?=\\s(?:${STOP_WORDS.join("|")}|$))`, "i");
    const match = input.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractEntityName(input: string, entityWord: string) {
  const match = input.match(new RegExp(`^\\s*${entityWord}\\s+(?:add|create|new|update|set|change|edit|delete|remove)?\\s*(.+)$`, "i"));
  if (!match?.[1]) return "";
  const value = match[1];
  const stopRegex = new RegExp(`\\b(${STOP_WORDS.join("|")})\\b`, "i");
  const stopIdx = value.search(stopRegex);
  return (stopIdx === -1 ? value : value.slice(0, stopIdx)).trim();
}

function fuzzyFind<T>(items: T[], text: string, selector: (item: T) => string) {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  return items.find((item) => {
    const hay = selector(item).toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  }) ?? null;
}

function resolveAccountId(raw: string, banks: BankAccount[], cards: CreditCard[]) {
  const text = raw.trim().toLowerCase();
  if (!text) return "unassigned";
  const bank = fuzzyFind(banks, text, (item) => `${item.institution} ${item.nickname} ${item.id}`);
  if (bank) return bank.id;
  const card = fuzzyFind(cards, text, (item) => `${item.name} ${item.id}`);
  if (card) return card.id;
  return "unassigned";
}

function parseInlineAccount(input: string) {
  const accountField = parseField(input, ["from", "to", "into", "account", "on"]);
  if (accountField) return accountField;
  return input.match(/\bon\s+([a-z0-9\-_ ]+)$/i)?.[1]?.trim() ?? "";
}

function removeMoneyText(input: string) {
  return input.replace(/\$-?\d+(?:\.\d{1,2})?/g, " ").replace(/\s+/g, " ").trim();
}

function inferMerchantFromSimpleText(input: string) {
  const stripped = removeMoneyText(input)
    .replace(/\b(expense|income|spent|paid|pay|bought|purchase|deposit|received|add|create|new|update|set)\b/gi, " ")
    .replace(/\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b/gi, " ")
    .replace(/\b(on|from|to|into|account|at|category|note|date)\b\s+[a-z0-9\-_ ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "Manual Entry";
  return stripped.split(" ").slice(0, 4).join(" ");
}

function inferCategoryFromMerchant(merchant: string) {
  const lower = merchant.toLowerCase();
  if (/\b(mcdonalds|chipotle|starbucks|restaurant|cafe|pizza|burger)\b/.test(lower)) return "Dining";
  if (/\b(costco|walmart|target|kroger|trader joe|aldi|grocery)\b/.test(lower)) return "Groceries";
  if (/\b(shell|chevron|exxon|bp|gas)\b/.test(lower)) return "Transportation";
  if (/\b(netflix|spotify|hulu|disney)\b/.test(lower)) return "Entertainment";
  if (/\b(rent|apartment|landlord|mortgage)\b/.test(lower)) return "Housing";
  return "General";
}

function buildSubscriptionActions(payload: Subscription, existing: Subscription | null, mode: "upsert" | "delete" = "upsert") {
  if (mode === "delete") {
    return {
      actions: [
        { label: `Clear scheduled charges ${payload.name}`, run: () => clearScheduledChargesForSubscription(payload.id) },
        { label: `Delete subscription ${payload.name}`, run: () => db.deleteSubscription(payload.id) }
      ] as ParsedAction[]
    };
  }
  return {
    actions: [
      { label: `${existing ? "Update" : "Add"} subscription ${payload.name}`, run: () => db.upsertSubscription(payload) },
      { label: `Sync scheduled charges ${payload.name}`, run: () => syncScheduledChargesForSubscription(payload) }
    ] as ParsedAction[]
  };
}

function parseTransferCommand(input: string, context: ParseContext) {
  if (!/^\s*transfer\b/i.test(input)) return null;
  const amount = parseAmount(input);
  if (amount <= 0) return { error: "Transfer requires amount. Example: transfer $300 from checking to savings." };
  const from = parseField(input, ["from"]);
  const to = parseField(input, ["to", "into"]);
  if (!from || !to) return { error: "Transfer requires both 'from' and 'to' accounts." };
  const fromAccount = resolveAccountId(from, context.banks, context.cards);
  const toAccount = resolveAccountId(to, context.banks, context.cards);
  if (fromAccount === "unassigned" || toAccount === "unassigned") return { error: "Could not match transfer accounts. Use account nickname/name." };
  const date = parseDate(input);
  const note = parseField(input, ["note"]);
  return {
    actions: [
      {
        label: `Transfer out ${amount} from ${from}`,
        run: () => db.upsertTransaction({ id: crypto.randomUUID(), date, amount, type: "expense", category: "Transfer", merchant: "Internal Transfer", account: fromAccount, note: note || `Transfer to ${to}`, recurring: 0 })
      },
      {
        label: `Transfer in ${amount} to ${to}`,
        run: () => db.upsertTransaction({ id: crypto.randomUUID(), date, amount, type: "income", category: "Transfer", merchant: "Internal Transfer", account: toAccount, note: note || `Transfer from ${from}`, recurring: 0 })
      }
    ] as ParsedAction[]
  };
}

function parseTransactionCommand(input: string, context: ParseContext) {
  const lower = input.toLowerCase();
  const isIncome = /\b(income|paycheck|salary|deposit|earned|received)\b/.test(lower);
  const isExpense = /\b(expense|spent|pay|paid|bought|purchase|withdraw)\b/.test(lower);
  if (!isIncome && !isExpense) return null;
  const amount = parseAmount(input);
  if (amount <= 0) return { error: "Could not detect a valid transaction amount." };
  const accountText = parseInlineAccount(input);
  const category = parseField(input, ["category"]) || (isIncome ? "Income" : "General");
  const merchant = parseField(input, ["merchant", "at", "source", "payee"]) || (isIncome ? "Income Source" : "Manual Entry");
  const payload: Transaction = {
    id: crypto.randomUUID(),
    date: parseDate(input),
    amount,
    type: isIncome ? "income" : "expense",
    category,
    merchant,
    account: resolveAccountId(accountText, context.banks, context.cards),
    note: parseField(input, ["note"]),
    recurring: /\brecurring\b/i.test(input) ? 1 : 0
  };
  return { actions: [{ label: `${payload.type} ${payload.amount} ${payload.category}`, run: () => db.upsertTransaction(payload) }] as ParsedAction[] };
}

function parseSimpleTransactionCommand(input: string, context: ParseContext) {
  if (/\b(bank|card|subscription|sub|scenario|retirement|401k|transfer)\b/i.test(input)) return null;
  const amount = parseAmount(input);
  if (amount <= 0) return null;
  const lower = input.toLowerCase();
  const type: Transaction["type"] = /\b(income|deposit|received|salary|paycheck)\b/.test(lower) ? "income" : "expense";
  const merchant = parseField(input, ["merchant", "at", "source", "payee"]) || inferMerchantFromSimpleText(input);
  const payload: Transaction = {
    id: crypto.randomUUID(),
    date: parseDate(input),
    amount,
    type,
    category: parseField(input, ["category"]) || (type === "income" ? "Income" : inferCategoryFromMerchant(merchant)),
    merchant,
    account: resolveAccountId(parseInlineAccount(input), context.banks, context.cards),
    note: parseField(input, ["note"]),
    recurring: /\brecurring\b/i.test(input) ? 1 : 0
  };
  return { actions: [{ label: `${payload.type} ${payload.amount} ${payload.merchant}`, run: () => db.upsertTransaction(payload) }] as ParsedAction[] };
}

function parseBankCommand(input: string, context: ParseContext) {
  if (!/^\s*bank\b/i.test(input)) return null;
  const action = /\b(delete|remove)\b/i.test(input) ? "delete" : /\b(add|create|new)\b/i.test(input) ? "add" : "update";
  const name = parseField(input, ["bank", "account"]) || extractEntityName(input, "bank");
  const existing = fuzzyFind(context.banks, name, (item) => `${item.institution} ${item.nickname} ${item.id}`);
  if (action === "delete") {
    if (!existing) return { error: `Could not find bank account "${name}" to delete.` };
    return { actions: [{ label: `Delete bank ${existing.nickname}`, run: () => db.deleteBank(existing.id) }] as ParsedAction[] };
  }
  const payload: BankAccount = existing
    ? {
        ...existing,
        institution: parseField(input, ["institution"]) || existing.institution,
        nickname: parseField(input, ["nickname"]) || existing.nickname,
        type: (parseWordByKey(input, ["type"]) as BankAccount["type"]) ?? existing.type,
        currentBalance: parseNumberByKey(input, ["balance"]) ?? existing.currentBalance,
        availableBalance: parseNumberByKey(input, ["available"]) ?? existing.availableBalance,
        apy: parseNumberByKey(input, ["apy"]) ?? existing.apy,
        lastUpdated: parseDate(input),
        imageDataUrl: existing.imageDataUrl ?? ""
      }
    : {
        id: crypto.randomUUID(),
        institution: parseField(input, ["institution"]) || name || "Manual Bank",
        nickname: parseField(input, ["nickname"]) || "Primary",
        type: (parseWordByKey(input, ["type"]) as BankAccount["type"]) ?? "checking",
        currentBalance: parseNumberByKey(input, ["balance"]) ?? 0,
        availableBalance: parseNumberByKey(input, ["available"]) ?? parseNumberByKey(input, ["balance"]) ?? 0,
        apy: parseNumberByKey(input, ["apy"]) ?? 0,
        lastUpdated: parseDate(input),
        imageDataUrl: ""
      };
  return { actions: [{ label: `${existing ? "Update" : "Add"} bank ${payload.nickname}`, run: () => db.upsertBank(payload) }] as ParsedAction[] };
}

function parseCardCommand(input: string, context: ParseContext) {
  if (!/^\s*(card|credit card)\b/i.test(input)) return null;
  const action = /\b(delete|remove)\b/i.test(input) ? "delete" : /\b(add|create|new)\b/i.test(input) ? "add" : "update";
  const name = parseField(input, ["card", "credit card"]) || extractEntityName(input, "card");
  const existing = fuzzyFind(context.cards, name, (item) => `${item.name} ${item.id}`);
  if (action === "delete") {
    if (!existing) return { error: `Could not find card "${name}" to delete.` };
    return { actions: [{ label: `Delete card ${existing.name}`, run: () => db.deleteCard(existing.id) }] as ParsedAction[] };
  }
  const dueDate = parseField(input, ["due"]) || parseDate(input);
  const payload: CreditCard = existing
    ? {
        ...existing,
        name: name || existing.name,
        balance: parseNumberByKey(input, ["balance"]) ?? existing.balance,
        limitAmount: parseNumberByKey(input, ["limit"]) ?? existing.limitAmount,
        apr: parseNumberByKey(input, ["apr"]) ?? existing.apr,
        minPayment: parseNumberByKey(input, ["min", "minimum"]) ?? existing.minPayment,
        dueDate
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Card",
        balance: parseNumberByKey(input, ["balance"]) ?? 0,
        limitAmount: parseNumberByKey(input, ["limit"]) ?? 0,
        apr: parseNumberByKey(input, ["apr"]) ?? 0,
        minPayment: parseNumberByKey(input, ["min", "minimum"]) ?? 0,
        dueDate
      };
  return { actions: [{ label: `${existing ? "Update" : "Add"} card ${payload.name}`, run: () => db.upsertCard(payload) }] as ParsedAction[] };
}

function parseSubscriptionCommand(input: string, context: ParseContext) {
  if (!/^\s*(subscription|sub)\b/i.test(input)) return null;
  const action = /\b(delete|remove)\b/i.test(input) ? "delete" : /\b(add|create|new)\b/i.test(input) ? "add" : "update";
  const name = parseField(input, ["subscription", "sub"]) || extractEntityName(input, "subscription");
  const existing = fuzzyFind(context.subscriptions, name, (item) => `${item.name} ${item.id}`);
  if (action === "delete") {
    if (!existing) return { error: `Could not find subscription "${name}" to delete.` };
    return buildSubscriptionActions(existing, existing, "delete");
  }
  const frequency = (parseWordByKey(input, ["frequency"]) || /\bmonthly|quarterly|yearly\b/i.exec(input)?.[0]?.toLowerCase() || "monthly") as Subscription["frequency"];
  const payload: Subscription = existing
    ? {
        ...existing,
        name: name || existing.name,
        cost: parseNumberByKey(input, ["cost", "price", "amount"]) ?? existing.cost,
        frequency,
        nextDueDate: parseSubscriptionDueDate(input, frequency),
        category: parseField(input, ["category"]) || existing.category || "General",
        accountId: resolveAccountId(parseInlineAccount(input), context.banks, context.cards) || existing.accountId || "unassigned",
        imageDataUrl: existing.imageDataUrl ?? "",
        isActive: /\b(inactive|pause|paused|disabled)\b/i.test(input) ? 0 : 1
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Subscription",
        cost: parseNumberByKey(input, ["cost", "price", "amount"]) ?? 0,
        frequency,
        nextDueDate: parseSubscriptionDueDate(input, frequency),
        category: parseField(input, ["category"]) || "General",
        accountId: resolveAccountId(parseInlineAccount(input), context.banks, context.cards),
        imageDataUrl: "",
        isActive: /\b(inactive|pause|paused|disabled)\b/i.test(input) ? 0 : 1
      };
  return buildSubscriptionActions(payload, existing);
}

function parseImplicitSubscriptionCommand(input: string, context: ParseContext) {
  if (!/\b(monthly|quarterly|yearly)\b/i.test(input)) return null;
  if (/\b(income|expense|spent|paid|transfer|bank|card|scenario|retirement|401k)\b/i.test(input)) return null;
  const amount = parseAmount(input);
  if (amount <= 0) return null;
  const name = inferMerchantFromSimpleText(input);
  const existing = fuzzyFind(context.subscriptions, name, (item) => `${item.name} ${item.id}`);
  const payload: Subscription = existing
    ? {
        ...existing,
        name: name || existing.name,
        cost: amount,
        frequency: (/\bmonthly|quarterly|yearly\b/i.exec(input)?.[0].toLowerCase() as Subscription["frequency"]) || existing.frequency,
        nextDueDate: parseSubscriptionDueDate(input, (/\bmonthly|quarterly|yearly\b/i.exec(input)?.[0].toLowerCase() as Subscription["frequency"]) || existing.frequency),
        category: existing.category || inferCategoryFromMerchant(name),
        accountId: resolveAccountId(parseInlineAccount(input), context.banks, context.cards) || existing.accountId || "unassigned",
        imageDataUrl: existing.imageDataUrl ?? "",
        isActive: 1
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Subscription",
        cost: amount,
        frequency: ((/\bmonthly|quarterly|yearly\b/i.exec(input)?.[0].toLowerCase() as Subscription["frequency"]) || "monthly"),
        nextDueDate: parseSubscriptionDueDate(input, ((/\bmonthly|quarterly|yearly\b/i.exec(input)?.[0].toLowerCase() as Subscription["frequency"]) || "monthly")),
        category: inferCategoryFromMerchant(name),
        accountId: resolveAccountId(parseInlineAccount(input), context.banks, context.cards),
        imageDataUrl: "",
        isActive: 1
      };
  return buildSubscriptionActions(payload, existing);
}

function parseScenarioCommand(input: string, context: ParseContext) {
  if (!/^\s*(scenario|what-if|what if)\b/i.test(input)) return null;
  const action = /\b(delete|remove)\b/i.test(input) ? "delete" : /\b(add|create|new)\b/i.test(input) ? "add" : "update";
  const name = parseField(input, ["scenario", "what-if", "what if"]) || extractEntityName(input, "scenario");
  const existing = fuzzyFind(context.scenarios, name, (item) => `${item.name} ${item.id}`);
  if (action === "delete") {
    if (!existing) return { error: `Could not find scenario "${name}" to delete.` };
    return { actions: [{ label: `Delete scenario ${existing.name}`, run: () => db.deleteScenario(existing.id) }] as ParsedAction[] };
  }
  const payload: Scenario = existing
    ? {
        ...existing,
        name: name || existing.name,
        purchaseAmount: parseNumberByKey(input, ["amount", "purchase", "cost"]) ?? existing.purchaseAmount,
        durationMonths: Math.max(1, Math.round(parseNumberByKey(input, ["months", "duration"]) ?? existing.durationMonths)),
        paymentType: /\bcard\b/i.test(input) ? "card" : "cash",
        accountId: resolveAccountId(parseField(input, ["account", "from"]), context.banks, context.cards),
        scheduleDate: parseField(input, ["schedule"]) || parseDate(input),
        isApplied: /\b(apply|active|enabled)\b/i.test(input) ? 1 : /\b(draft|off|disabled)\b/i.test(input) ? 0 : existing.isApplied
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Scenario",
        purchaseAmount: parseNumberByKey(input, ["amount", "purchase", "cost"]) ?? 0,
        durationMonths: Math.max(1, Math.round(parseNumberByKey(input, ["months", "duration"]) ?? 1)),
        paymentType: /\bcard\b/i.test(input) ? "card" : "cash",
        createdAt: localIsoDate(),
        accountId: resolveAccountId(parseField(input, ["account", "from"]), context.banks, context.cards),
        scheduleDate: parseField(input, ["schedule"]) || parseDate(input),
        isApplied: /\b(apply|active|enabled)\b/i.test(input) ? 1 : 0
      };
  return { actions: [{ label: `${existing ? "Update" : "Add"} scenario ${payload.name}`, run: () => db.upsertScenario(payload) }] as ParsedAction[] };
}

function parseRetirementCommand(input: string, context: ParseContext) {
  if (!/^\s*(retirement|401k)\b/i.test(input)) return null;
  const action = /\b(delete|remove)\b/i.test(input) ? "delete" : "add";
  const date = parseDate(input);
  const existing = context.retirementEntries.find((entry) => entry.date === date) ?? null;
  if (action === "delete") {
    if (!existing) return { error: `Could not find retirement entry on ${date} to delete.` };
    return { actions: [{ label: `Delete retirement entry ${date}`, run: () => db.deleteRetirementEntry(existing.id) }] as ParsedAction[] };
  }
  const payload: RetirementEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    date,
    employeeContribution: parseNumberByKey(input, ["employee", "contribution"]) ?? existing?.employeeContribution ?? 0,
    employerMatch: parseNumberByKey(input, ["match", "employer"]) ?? existing?.employerMatch ?? 0,
    balance: parseNumberByKey(input, ["balance"]) ?? existing?.balance ?? 0,
    annualReturn: parseNumberByKey(input, ["return", "annual"]) ?? existing?.annualReturn ?? 7
  };
  return { actions: [{ label: `${existing ? "Update" : "Add"} retirement entry ${date}`, run: () => db.upsertRetirementEntry(payload) }] as ParsedAction[] };
}

export function parseActions(input: string, context: ParseContext) {
  const statements = input.split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  if (statements.length === 0) return { error: "Enter at least one command." };
  const actions: ParsedAction[] = [];
  for (const statement of statements) {
    const parsers = [parseTransferCommand, parseBankCommand, parseCardCommand, parseSubscriptionCommand, parseImplicitSubscriptionCommand, parseScenarioCommand, parseRetirementCommand, parseTransactionCommand, parseSimpleTransactionCommand] as const;
    let resolved = false;
    for (const parser of parsers) {
      const result = parser(statement, context);
      if (!result) continue;
      if ("error" in result) return { error: result.error };
      actions.push(...result.actions);
      resolved = true;
      break;
    }
    if (!resolved) return { error: `Could not parse command: "${statement}"` };
  }
  return { actions };
}

export function AiCommandBox() {
  const banks = useFinanceStore((state) => state.banks);
  const cards = useFinanceStore((state) => state.cards);
  const subscriptions = useFinanceStore((state) => state.subscriptions);
  const scenarios = useFinanceStore((state) => state.scenarios);
  const retirementEntries = useFinanceStore((state) => state.retirementEntries);
  const refreshAll = useFinanceStore((state) => state.refreshAll);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const examples = useMemo(
    () => [
      "$32 mcdonalds on chase",
      "expense $42.80 category Food at Chipotle from chase checking on 2026-02-13 note lunch",
      "income $2100 category Salary source Employer into chase checking on 2026-02-15",
      "netflix $15.49 monthly on 2026-03-01",
      "transfer $300 from chase checking to ally savings on today",
      "bank update chase checking balance 1825.34 available 1710.00 apy 0.5",
      "card add amex gold balance 2200 limit 6000 apr 24.99 min 80 due 2026-03-07",
      "subscription add netflix cost 15.49 monthly due 2026-02-22 category streaming",
      "scenario add laptop amount 1800 months 12 payment card account amex schedule 2026-03-01 apply",
      "retirement add date 2026-02-01 balance 12000 employee 500 match 200 return 7.5"
    ],
    []
  );

  const applyCommands = async () => {
    const parsed = parseActions(input, { banks, cards, subscriptions, scenarios, retirementEntries });
    if (!("actions" in parsed)) {
      setStatus(parsed.error);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      for (const action of parsed.actions) await action.run();
      await refreshAll();
      setStatus(`Applied ${parsed.actions.length} change${parsed.actions.length === 1 ? "" : "s"}: ${parsed.actions.map((a) => a.label).join(" | ")}`);
      setInput("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not apply command.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel ai-command-panel">
      <div className="panel-head">
        <h3>AI Command Box (Overview Only)</h3>
        <button className="chip-btn" onClick={() => setInput(examples.join("\n"))}>Insert Examples</button>
      </div>
      <p className="muted">Simple commands work: "$32 mcdonalds on chase", "netflix $15 monthly on 2026-03-01", "transfer $200 from checking to savings".</p>
      <label>
        Command Input
        <textarea rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder={examples[0]} />
      </label>
      <div className="row-actions">
        <button type="button" onClick={() => void applyCommands()} disabled={busy || input.trim().length === 0}>{busy ? "Applying..." : "Apply Commands"}</button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </article>
  );
}

