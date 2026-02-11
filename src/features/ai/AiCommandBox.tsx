import { useMemo, useState } from "react";
import { db } from "../../data/db";
import { localIsoDate } from "../../domain/calculations";
import type { BankAccount, CreditCard, RetirementEntry, Scenario, Subscription, Transaction } from "../../domain/models";
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
  "on",
  "date",
  "note",
  "category",
  "merchant",
  "source",
  "from",
  "to",
  "into",
  "account",
  "balance",
  "available",
  "apy",
  "type",
  "institution",
  "nickname",
  "limit",
  "apr",
  "min",
  "due",
  "cost",
  "frequency",
  "amount",
  "months",
  "duration",
  "payment",
  "schedule",
  "employee",
  "match",
  "return"
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
  const cleaned = (stopIdx === -1 ? value : value.slice(0, stopIdx)).trim();
  return cleaned;
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

function parseTransferCommand(input: string, context: ParseContext) {
  if (!/^\s*transfer\b/i.test(input)) return null;
  const amount = parseAmount(input);
  if (amount <= 0) return { error: "Transfer requires amount. Example: transfer $300 from checking to savings." };
  const from = parseField(input, ["from"]);
  const to = parseField(input, ["to", "into"]);
  if (!from || !to) return { error: "Transfer requires both 'from' and 'to' accounts." };
  const fromAccount = resolveAccountId(from, context.banks, context.cards);
  const toAccount = resolveAccountId(to, context.banks, context.cards);
  if (fromAccount === "unassigned" || toAccount === "unassigned") {
    return { error: "Could not match transfer accounts. Use account nickname/name." };
  }
  const date = parseDate(input);
  const note = parseField(input, ["note"]);
  return {
    actions: [
      {
        label: `Transfer out ${amount} from ${from}`,
        run: () =>
          db.upsertTransaction({
            id: crypto.randomUUID(),
            date,
            amount,
            type: "expense",
            category: "Transfer",
            merchant: "Internal Transfer",
            account: fromAccount,
            note: note || `Transfer to ${to}`,
            recurring: 0
          })
      },
      {
        label: `Transfer in ${amount} to ${to}`,
        run: () =>
          db.upsertTransaction({
            id: crypto.randomUUID(),
            date,
            amount,
            type: "income",
            category: "Transfer",
            merchant: "Internal Transfer",
            account: toAccount,
            note: note || `Transfer from ${from}`,
            recurring: 0
          })
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
  const accountText = parseField(input, ["from", "to", "into", "account"]);
  const category = parseField(input, ["category"]) || (isIncome ? "Income" : "General");
  const merchant = parseField(input, ["merchant", "at", "source", "payee"]) || (isIncome ? "Income Source" : "Manual Entry");
  const note = parseField(input, ["note"]);
  const date = parseDate(input);
  const recurring = /\brecurring\b/i.test(input) ? 1 : 0;
  const payload: Transaction = {
    id: crypto.randomUUID(),
    date,
    amount,
    type: isIncome ? "income" : "expense",
    category,
    merchant,
    account: resolveAccountId(accountText, context.banks, context.cards),
    note,
    recurring
  };
  return {
    actions: [
      {
        label: `${payload.type} ${payload.amount} ${payload.category}`,
        run: () => db.upsertTransaction(payload)
      }
    ] as ParsedAction[]
  };
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

  const balance = parseNumberByKey(input, ["balance"]);
  const available = parseNumberByKey(input, ["available"]);
  const apy = parseNumberByKey(input, ["apy"]);
  const type = parseWordByKey(input, ["type"]);
  const institution = parseField(input, ["institution"]);
  const nickname = parseField(input, ["nickname"]);
  const payload: BankAccount = existing
    ? {
        ...existing,
        institution: institution || existing.institution,
        nickname: nickname || existing.nickname,
        type: (type as BankAccount["type"]) ?? existing.type,
        currentBalance: typeof balance === "number" ? balance : existing.currentBalance,
        availableBalance: typeof available === "number" ? available : existing.availableBalance,
        apy: typeof apy === "number" ? apy : existing.apy,
        lastUpdated: parseDate(input)
      }
    : {
        id: crypto.randomUUID(),
        institution: institution || name || "Manual Bank",
        nickname: nickname || "Primary",
        type: (type as BankAccount["type"]) ?? "checking",
        currentBalance: typeof balance === "number" ? balance : 0,
        availableBalance: typeof available === "number" ? available : typeof balance === "number" ? balance : 0,
        apy: typeof apy === "number" ? apy : 0,
        lastUpdated: parseDate(input)
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
  const balance = parseNumberByKey(input, ["balance"]);
  const limit = parseNumberByKey(input, ["limit"]);
  const apr = parseNumberByKey(input, ["apr"]);
  const minPayment = parseNumberByKey(input, ["min", "minimum"]);
  const dueDate = parseField(input, ["due"]) || parseDate(input);
  const payload: CreditCard = existing
    ? {
        ...existing,
        name: name || existing.name,
        balance: typeof balance === "number" ? balance : existing.balance,
        limitAmount: typeof limit === "number" ? limit : existing.limitAmount,
        apr: typeof apr === "number" ? apr : existing.apr,
        minPayment: typeof minPayment === "number" ? minPayment : existing.minPayment,
        dueDate
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Card",
        balance: typeof balance === "number" ? balance : 0,
        limitAmount: typeof limit === "number" ? limit : 0,
        apr: typeof apr === "number" ? apr : 0,
        minPayment: typeof minPayment === "number" ? minPayment : 0,
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
    return { actions: [{ label: `Delete subscription ${existing.name}`, run: () => db.deleteSubscription(existing.id) }] as ParsedAction[] };
  }
  const cost = parseNumberByKey(input, ["cost", "price", "amount"]);
  const frequency = parseWordByKey(input, ["frequency"]) || (/\bmonthly|quarterly|yearly\b/i.exec(input)?.[0].toLowerCase() ?? undefined);
  const due = parseField(input, ["due"]) || parseDate(input);
  const category = parseField(input, ["category"]) || existing?.category || "General";
  const isActive = /\b(inactive|pause|paused|disabled)\b/i.test(input) ? 0 : 1;
  const payload: Subscription = existing
    ? {
        ...existing,
        name: name || existing.name,
        cost: typeof cost === "number" ? cost : existing.cost,
        frequency: (frequency as Subscription["frequency"]) ?? existing.frequency,
        nextDueDate: due,
        category,
        isActive
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Subscription",
        cost: typeof cost === "number" ? cost : 0,
        frequency: (frequency as Subscription["frequency"]) ?? "monthly",
        nextDueDate: due,
        category,
        isActive
      };
  return { actions: [{ label: `${existing ? "Update" : "Add"} subscription ${payload.name}`, run: () => db.upsertSubscription(payload) }] as ParsedAction[] };
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
  const amount = parseNumberByKey(input, ["amount", "purchase", "cost"]);
  const months = parseNumberByKey(input, ["months", "duration"]);
  const paymentType = /\bcard\b/i.test(input) ? "card" : "cash";
  const accountText = parseField(input, ["account", "from"]);
  const scheduleDate = parseField(input, ["schedule"]) || parseDate(input);
  const isApplied = /\b(apply|active|enabled)\b/i.test(input) ? 1 : /\b(draft|off|disabled)\b/i.test(input) ? 0 : existing?.isApplied ?? 0;
  const payload: Scenario = existing
    ? {
        ...existing,
        name: name || existing.name,
        purchaseAmount: typeof amount === "number" ? amount : existing.purchaseAmount,
        durationMonths: typeof months === "number" ? Math.max(1, Math.round(months)) : existing.durationMonths,
        paymentType,
        accountId: resolveAccountId(accountText, context.banks, context.cards) || existing.accountId,
        scheduleDate,
        isApplied
      }
    : {
        id: crypto.randomUUID(),
        name: name || "Scenario",
        purchaseAmount: typeof amount === "number" ? amount : 0,
        durationMonths: typeof months === "number" ? Math.max(1, Math.round(months)) : 1,
        paymentType,
        createdAt: localIsoDate(),
        accountId: resolveAccountId(accountText, context.banks, context.cards),
        scheduleDate,
        isApplied
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
  const balance = parseNumberByKey(input, ["balance"]) ?? existing?.balance ?? 0;
  const employee = parseNumberByKey(input, ["employee", "contribution"]) ?? existing?.employeeContribution ?? 0;
  const employerMatch = parseNumberByKey(input, ["match", "employer"]) ?? existing?.employerMatch ?? 0;
  const annualReturn = parseNumberByKey(input, ["return", "annual"]) ?? existing?.annualReturn ?? 7;
  const payload: RetirementEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    date,
    employeeContribution: employee,
    employerMatch,
    balance,
    annualReturn
  };
  return { actions: [{ label: `${existing ? "Update" : "Add"} retirement entry ${date}`, run: () => db.upsertRetirementEntry(payload) }] as ParsedAction[] };
}

function parseActions(input: string, context: ParseContext) {
  const statements = input
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (statements.length === 0) return { error: "Enter at least one command." };

  const actions: ParsedAction[] = [];
  for (const statement of statements) {
    const parsers = [
      parseTransferCommand,
      parseBankCommand,
      parseCardCommand,
      parseSubscriptionCommand,
      parseScenarioCommand,
      parseRetirementCommand,
      parseTransactionCommand
    ] as const;
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
      "expense $42.80 category Food at Chipotle from chase checking on 2026-02-13 note lunch",
      "income $2100 category Salary source Employer into chase checking on 2026-02-15",
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
      for (const action of parsed.actions) {
        await action.run();
      }
      await refreshAll();
      setStatus(`Applied ${parsed.actions.length} change${parsed.actions.length === 1 ? "" : "s"}: ${parsed.actions.map((a) => a.label).join(" | ")}`);
      setInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply command.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel ai-command-panel">
      <div className="panel-head">
        <h3>AI Command Box (Overview Only)</h3>
        <button className="chip-btn" onClick={() => setInput(examples.join("\n"))}>
          Insert Examples
        </button>
      </div>
      <p className="muted">Enter one command per line. Supports add/update/delete for transactions, transfers, banks, cards, subscriptions, scenarios, and retirement entries.</p>
      <label>
        Command Input
        <textarea rows={7} value={input} onChange={(event) => setInput(event.target.value)} placeholder={examples[0]} />
      </label>
      <div className="row-actions">
        <button type="button" onClick={() => void applyCommands()} disabled={busy || input.trim().length === 0}>
          {busy ? "Applying..." : "Apply Commands"}
        </button>
      </div>
      <p className="muted">
        Quick format tips: use keywords like <code>category</code>, <code>from</code>, <code>to</code>, <code>on</code>, <code>balance</code>, <code>limit</code>, <code>due</code>, <code>cost</code>, <code>months</code>, <code>payment</code>, <code>schedule</code>, <code>employee</code>, <code>match</code>, <code>return</code>.
      </p>
      {status ? <p className="muted">{status}</p> : null}
    </article>
  );
}

