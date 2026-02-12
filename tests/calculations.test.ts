import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, calculateRetirementProjection, evaluateScenario } from "../src/domain/calculations";
import type { BankAccount, CreditCard, RetirementEntry, Scenario, Subscription, Transaction } from "../src/domain/models";

describe("finance calculations", () => {
  it("computes dashboard metrics", () => {
    const tx: Transaction[] = [
      {
        id: "1",
        date: "2026-01-01",
        amount: 5000,
        type: "income",
        category: "Paycheck",
        merchant: "",
        account: "b1",
        note: "",
        recurring: 1
      },
      {
        id: "2",
        date: "2026-01-02",
        amount: 1200,
        type: "expense",
        category: "Rent",
        merchant: "Landlord",
        account: "b1",
        note: "",
        recurring: 1
      },
      {
        id: "3",
        date: "2099-01-01",
        amount: 500,
        type: "income",
        category: "Future Bonus",
        merchant: "",
        account: "b1",
        note: "",
        recurring: 0
      },
      {
        id: "4",
        date: "2026-01-03",
        amount: 100,
        type: "expense",
        category: "Dining",
        merchant: "Card Purchase",
        account: "c1",
        note: "",
        recurring: 0
      }
    ];
    const subs: Subscription[] = [
      {
        id: "s1",
        name: "Music",
        cost: 12,
        frequency: "monthly",
        nextDueDate: "2026-02-01",
        category: "Entertainment",
        accountId: "b1",
        imageDataUrl: "",
        isActive: 1
      }
    ];
    const cards: CreditCard[] = [
      { id: "c1", name: "Visa", balance: 400, limitAmount: 2000, apr: 21, minPayment: 25, dueDate: "2026-02-15" }
    ];
    const retirement: RetirementEntry[] = [
      { id: "r1", date: "2026-01-01", employeeContribution: 300, employerMatch: 200, balance: 20000, annualReturn: 7 }
    ];
    const banks: BankAccount[] = [
      {
        id: "b1",
        institution: "Example Bank",
        nickname: "Main Checking",
        type: "checking",
        currentBalance: 3400,
        availableBalance: 3350,
        apy: 0.1,
        lastUpdated: "2026-01-10",
        imageDataUrl: ""
      }
    ];

    const metrics = calculateDashboardMetrics(tx, subs, cards, retirement, banks);
    expect(metrics.netCashflow).toBe(3800);
    expect(metrics.monthlySubscriptions).toBe(12);
    expect(metrics.totalCreditBalance).toBe(500);
    expect(metrics.averageUtilizationPct).toBe(20);
    expect(metrics.bankCashPosition).toBe(7200);
  });

  it("projects retirement growth", () => {
    const entries: RetirementEntry[] = [
      { id: "r1", date: "2026-01-01", employeeContribution: 500, employerMatch: 250, balance: 50000, annualReturn: 8 }
    ];
    const value = calculateRetirementProjection(entries);
    expect(value).toBeGreaterThan(59000);
  });

  it("evaluates what-if scenario impact", () => {
    const scenario: Scenario = {
      id: "w1",
      name: "Laptop",
      purchaseAmount: 2400,
      durationMonths: 12,
      paymentType: "card",
      createdAt: "2026-01-01",
      accountId: "unassigned",
      scheduleDate: "2026-01-02",
      isApplied: 1
    };
    const result = evaluateScenario(scenario, 2000, 200, []);
    expect(result.monthlyScenarioCost).toBe(200);
    expect(result.projectedDisposableAfterPurchase).toBe(1600);
    expect(result.projectedDebt).toBe(2400);
  });
});

