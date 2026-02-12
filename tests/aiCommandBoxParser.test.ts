import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import type { BankAccount, CreditCard, RetirementEntry, Scenario, Subscription } from "../src/domain/models";
import { parseActions } from "../src/features/ai/AiCommandBox";

const banks: BankAccount[] = [
  {
    id: "bank-1",
    institution: "Chase",
    nickname: "Checking",
    type: "checking",
    currentBalance: 1000,
    availableBalance: 1000,
    apy: 0.01,
    lastUpdated: "2026-02-11",
    imageDataUrl: ""
  }
];

const cards: CreditCard[] = [
  {
    id: "card-discover",
    name: "Discover",
    balance: 0,
    limitAmount: 5000,
    apr: 24.99,
    minPayment: 35,
    dueDate: "2026-03-10"
  }
];
const scenarios: Scenario[] = [];
const retirementEntries: RetirementEntry[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AI command parsing", () => {
  it("parses short expense commands", () => {
    const result = parseActions("$32 mcdonalds on chase", {
      banks,
      cards,
      subscriptions: [],
      scenarios,
      retirementEntries
    });
    expect("actions" in result).toBe(true);
    if ("actions" in result) {
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].label).toContain("32");
    }
  });

  it("routes short 'charge to <card name>' command to the matching credit card account", async () => {
    const upsertTransaction = vi.spyOn(db, "upsertTransaction").mockResolvedValue(true);
    const result = parseActions("21.28 charge to discover", {
      banks,
      cards,
      subscriptions: [],
      scenarios,
      retirementEntries
    });
    expect("actions" in result).toBe(true);
    if ("actions" in result) {
      expect(result.actions).toHaveLength(1);
      await result.actions[0].run();
      expect(upsertTransaction).toHaveBeenCalledTimes(1);
      const payload = upsertTransaction.mock.calls[0][0];
      expect(payload.account).toBe("card-discover");
      expect(payload.amount).toBe(21.28);
    }
  });

  it("creates subscription and scheduled charge sync actions for implicit subscription text", async () => {
    const upsertSubscription = vi.spyOn(db, "upsertSubscription").mockResolvedValue(true);
    const upsertTransaction = vi.spyOn(db, "upsertTransaction").mockResolvedValue(true);
    vi.spyOn(db, "listTransactions").mockResolvedValue([]);
    vi.spyOn(db, "deleteTransaction").mockResolvedValue(true);
    const result = parseActions("netflix $15.49 monthly on 2026-03-01", {
      banks,
      cards,
      subscriptions: [],
      scenarios,
      retirementEntries
    });

    expect("actions" in result).toBe(true);
    if ("actions" in result) {
      expect(result.actions).toHaveLength(2);
      await result.actions[0].run();
      await result.actions[1].run();
      expect(upsertSubscription).toHaveBeenCalledTimes(1);
      expect(upsertTransaction).toHaveBeenCalled();
    }
  });

  it("deletes linked transaction when deleting a subscription", async () => {
    const deleteSubscription = vi.spyOn(db, "deleteSubscription").mockResolvedValue(true);
    const deleteTransaction = vi.spyOn(db, "deleteTransaction").mockResolvedValue(true);
    const subscriptions: Subscription[] = [
      {
        id: "sub-netflix",
        name: "Netflix",
        cost: 15.49,
        frequency: "monthly",
        nextDueDate: "2026-03-01",
        category: "Streaming",
        accountId: "bank-1",
        imageDataUrl: "",
        isActive: 1
      }
    ];
    vi.spyOn(db, "listTransactions").mockResolvedValue([
      {
        id: "scheduled-subscription:sub-netflix:0",
        date: "2026-03-01",
        amount: 15.49,
        type: "expense",
        category: "Streaming",
        merchant: "Netflix",
        account: "bank-1",
        note: "Subscription charge: sub-netflix",
        recurring: 1
      }
    ]);

    const result = parseActions("subscription delete netflix", {
      banks,
      cards,
      subscriptions,
      scenarios,
      retirementEntries
    });

    expect("actions" in result).toBe(true);
    if ("actions" in result) {
      expect(result.actions).toHaveLength(2);
      await result.actions[0].run();
      await result.actions[1].run();
      expect(deleteTransaction).toHaveBeenCalledTimes(1);
      expect(deleteSubscription).toHaveBeenCalledTimes(1);
    }
  });
});


