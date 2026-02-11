import { useMemo, useState } from "react";
import { db } from "../../data/db";
import { localIsoDate } from "../../domain/calculations";
import type { BankAccount, CreditCard, Transaction } from "../../domain/models";
import { useFinanceStore } from "../../state/store";

type ParsedAction =
  | { kind: "transaction"; payload: Transaction }
  | { kind: "bank"; payload: BankAccount };

function parseAmount(input: string) {
  const moneyMatch = input.match(/\$(-?\d+(?:\.\d{1,2})?)/);
  if (moneyMatch) return Math.abs(Number(moneyMatch[1]));
  const genericMatches = [...input.matchAll(/(-?\d+(?:\.\d{1,2})?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && Math.abs(value) < 1_000_000);
  return genericMatches.length > 0 ? Math.abs(genericMatches[0]) : 0;
}

function parseDate(input: string) {
  const dateMatch = input.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return dateMatch?.[0] ?? localIsoDate();
}

function parseField(input: string, names: string[]) {
  for (const name of names) {
    const pattern = new RegExp(`${name}\\s+(.+?)(?=\\s(?:on|date|note|category|merchant|source|from|to|into|account|balance|available|apy|type|institution|nickname|$))`, "i");
    const match = input.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function resolveAccountId(raw: string, banks: BankAccount[], cards: CreditCard[]) {
  const text = raw.trim().toLowerCase();
  if (!text) return "unassigned";
  const bank = banks.find((item) => `${item.institution} ${item.nickname} ${item.id}`.toLowerCase().includes(text));
  if (bank) return bank.id;
  const card = cards.find((item) => `${item.name} ${item.id}`.toLowerCase().includes(text));
  if (card) return card.id;
  return "unassigned";
}

function resolveBank(raw: string, banks: BankAccount[]) {
  const target = raw.trim().toLowerCase();
  if (!target) return null;
  return banks.find((bank) => `${bank.institution} ${bank.nickname} ${bank.id}`.toLowerCase().includes(target)) ?? null;
}

function parseTransactionCommand(input: string, banks: BankAccount[], cards: CreditCard[]) {
  const lower = input.toLowerCase();
  const isIncome = /\b(income|paycheck|salary|deposit|earned|received)\b/.test(lower);
  const isExpense = /\b(expense|spent|pay|paid|bought|purchase|withdraw)\b/.test(lower);
  if (!isIncome && !isExpense) {
    return { error: "Could not detect income/expense intent. Include words like 'income' or 'expense'." };
  }
  const amount = parseAmount(input);
  if (amount <= 0) {
    return { error: "Could not detect a valid amount. Example: '$82.40'." };
  }
  const accountText = parseField(input, ["from", "to", "into", "account"]);
  const category = parseField(input, ["category"]) || (isIncome ? "Income" : "General");
  const merchant = parseField(input, ["merchant", "at", "source"]) || (isIncome ? "Income Source" : "Manual Entry");
  const note = parseField(input, ["note"]);
  return {
    action: {
      kind: "transaction" as const,
      payload: {
        id: crypto.randomUUID(),
        date: parseDate(input),
        amount,
        type: isIncome ? "income" : "expense",
        category,
        merchant,
        account: resolveAccountId(accountText, banks, cards),
        note,
        recurring: /\brecurring\b/i.test(input) ? 1 : 0
      }
    }
  };
}

function parseBankCommand(input: string, banks: BankAccount[]) {
  const lower = input.toLowerCase();
  const isBankCommand = /\bbank\b/.test(lower) && /\b(add|create|new|update|set|change|edit)\b/.test(lower);
  if (!isBankCommand) return { error: "Not a bank command." };

  const targetText = parseField(input, ["bank account", "bank"]) || parseField(input, ["institution", "nickname"]);
  const balanceMatch = input.match(/balance\s+\$?(-?\d+(?:\.\d{1,2})?)/i);
  const availableMatch = input.match(/available\s+\$?(-?\d+(?:\.\d{1,2})?)/i);
  const apyMatch = input.match(/apy\s+(-?\d+(?:\.\d{1,2})?)/i);
  const typeMatch = input.match(/\b(checking|savings|brokerage|cash)\b/i);
  const institutionField = parseField(input, ["institution"]);
  const nicknameField = parseField(input, ["nickname"]);

  const existing = resolveBank(targetText, banks);
  const isCreate = /\b(add|create|new)\b/i.test(input) || !existing;
  const fallbackName = targetText || "Manual Bank";

  const next: BankAccount = existing
    ? {
        ...existing,
        currentBalance: balanceMatch ? Number(balanceMatch[1]) : existing.currentBalance,
        availableBalance: availableMatch ? Number(availableMatch[1]) : existing.availableBalance,
        apy: apyMatch ? Number(apyMatch[1]) : existing.apy,
        type: (typeMatch?.[1]?.toLowerCase() as BankAccount["type"]) ?? existing.type,
        institution: institutionField || existing.institution,
        nickname: nicknameField || existing.nickname,
        lastUpdated: parseDate(input)
      }
    : {
        id: crypto.randomUUID(),
        institution: institutionField || fallbackName,
        nickname: nicknameField || "Primary",
        type: (typeMatch?.[1]?.toLowerCase() as BankAccount["type"]) ?? "checking",
        currentBalance: balanceMatch ? Number(balanceMatch[1]) : 0,
        availableBalance: availableMatch ? Number(availableMatch[1]) : balanceMatch ? Number(balanceMatch[1]) : 0,
        apy: apyMatch ? Number(apyMatch[1]) : 0,
        lastUpdated: parseDate(input)
      };

  if (!isCreate && !existing) {
    return { error: "Could not find that bank account to update. Try adding 'institution' or use the bank ID/name." };
  }

  return {
    action: {
      kind: "bank" as const,
      payload: next
    }
  };
}

function parseActions(input: string, banks: BankAccount[], cards: CreditCard[]) {
  const statements = input
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    return { error: "Enter a command first." };
  }

  const actions: ParsedAction[] = [];
  for (const statement of statements) {
    const bankResult = parseBankCommand(statement, banks);
    if ("action" in bankResult) {
      actions.push(bankResult.action);
      continue;
    }
    const txResult = parseTransactionCommand(statement, banks, cards);
    if ("action" in txResult) {
      actions.push(txResult.action);
      continue;
    }
    return { error: `Could not parse command: "${statement}"` };
  }

  return { actions };
}

export function AiCommandBox() {
  const banks = useFinanceStore((state) => state.banks);
  const cards = useFinanceStore((state) => state.cards);
  const refreshAll = useFinanceStore((state) => state.refreshAll);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const placeholders = useMemo(
    () => [
      "expense $42.80 category Food at Chipotle from chase checking on 2026-02-13 note lunch",
      "income $2100 category Salary source Employer into main checking on 2026-02-15",
      "update bank chase checking balance 1825.34 available 1710.00 apy 0.5"
    ],
    []
  );

  const applyCommands = async () => {
    const parsed = parseActions(input, banks, cards);
    if (!("actions" in parsed)) {
      setStatus(parsed.error);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      for (const action of parsed.actions) {
        if (action.kind === "transaction") {
          await db.upsertTransaction(action.payload);
        } else if (action.kind === "bank") {
          await db.upsertBank(action.payload);
        }
      }
      await refreshAll();
      setStatus(`Applied ${parsed.actions.length} change${parsed.actions.length === 1 ? "" : "s"} across the app.`);
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
        <h3>AI Command Box (Beta)</h3>
        <button className="chip-btn" onClick={() => setInput(placeholders.join("\n"))}>
          Insert Examples
        </button>
      </div>
      <p className="muted">Type plain-language commands for expenses, income, and bank balance updates. One command per line.</p>
      <label>
        Command Input
        <textarea
          rows={4}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholders[0]}
        />
      </label>
      <div className="row-actions">
        <button type="button" onClick={() => void applyCommands()} disabled={busy || input.trim().length === 0}>
          {busy ? "Applying..." : "Apply Command"}
        </button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </article>
  );
}

