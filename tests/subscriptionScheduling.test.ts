import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import type { Subscription } from "../src/domain/models";
import { syncScheduledChargesForSubscription } from "../src/services/subscriptions/scheduledCharges";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscription scheduled charges", () => {
  it("creates quarterly charges over the scheduling horizon", async () => {
    const upsertTransaction = vi.spyOn(db, "upsertTransaction").mockResolvedValue(true);
    vi.spyOn(db, "listTransactions").mockResolvedValue([]);
    vi.spyOn(db, "deleteTransaction").mockResolvedValue(true);

    const subscription: Subscription = {
      id: "sub-quarterly",
      name: "Quarterly Software",
      cost: 1000,
      frequency: "quarterly",
      nextDueDate: "2026-03-11",
      category: "Software",
      accountId: "unassigned",
      imageDataUrl: "",
      isActive: 1
    };

    await syncScheduledChargesForSubscription(subscription);

    expect(upsertTransaction).toHaveBeenCalledTimes(4);
    const dates = upsertTransaction.mock.calls.map((call) => call[0].date);
    expect(dates).toEqual(["2026-03-11", "2026-06-11", "2026-09-11", "2026-12-11"]);
  });
});




