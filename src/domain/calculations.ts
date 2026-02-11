import type { BankAccount, CreditCard, DashboardMetrics, RetirementEntry, Scenario, Subscription, Transaction } from "./models";

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isPostedTransaction(transaction: Transaction, asOf = localIsoDate()) {
  return transaction.date <= asOf;
}

export function postedTransactionsAsOf(transactions: Transaction[], asOf = localIsoDate()) {
  return transactions.filter((tx) => isPostedTransaction(tx, asOf));
}

export function transactionDeltaByAccount(transactions: Transaction[], asOf = localIsoDate()) {
  const map = new Map<string, number>();
  postedTransactionsAsOf(transactions, asOf)
    .forEach((tx) => {
      const delta = tx.type === "income" ? tx.amount : -tx.amount;
      map.set(tx.account, (map.get(tx.account) ?? 0) + delta);
    });
  return map;
}

export function calculateMonthlySubscriptionCost(subscriptions: Subscription[]): number {
  return subscriptions.reduce((sum, item) => {
    if (!item.isActive) return sum;
    if (item.frequency === "monthly") return sum + item.cost;
    if (item.frequency === "quarterly") return sum + item.cost / 3;
    return sum + item.cost / 12;
  }, 0);
}

export function calculateUtilization(creditCards: CreditCard[]): number {
  const totalLimit = creditCards.reduce((sum, card) => sum + card.limitAmount, 0);
  if (totalLimit <= 0) return 0;
  const totalBalance = creditCards.reduce((sum, card) => sum + card.balance, 0);
  return (totalBalance / totalLimit) * 100;
}

export function calculateRetirementProjection(entries: RetirementEntry[]): number {
  const latest = entries[0];
  if (!latest) return 0;
  const monthlyContribution = latest.employeeContribution + latest.employerMatch;
  const monthlyRate = latest.annualReturn / 100 / 12;
  let projected = latest.balance;
  for (let i = 0; i < 12; i += 1) {
    projected = projected * (1 + monthlyRate) + monthlyContribution;
  }
  return projected;
}

export function calculateDashboardMetrics(
  transactions: Transaction[],
  subscriptions: Subscription[],
  creditCards: CreditCard[],
  retirementEntries: RetirementEntry[],
  bankAccounts: BankAccount[]
): DashboardMetrics {
  const postedTransactions = postedTransactionsAsOf(transactions);
  const accountDeltas = transactionDeltaByAccount(transactions);
  const income = postedTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = postedTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const retirementBalance = retirementEntries[0]?.balance ?? 0;
  return {
    income,
    expenses,
    netCashflow: income - expenses,
    monthlySubscriptions: calculateMonthlySubscriptionCost(subscriptions),
    totalCreditBalance: creditCards.reduce((sum, card) => sum + card.balance - (accountDeltas.get(card.id) ?? 0), 0),
    bankCashPosition: bankAccounts.reduce((sum, account) => sum + account.currentBalance + (accountDeltas.get(account.id) ?? 0), 0),
    averageUtilizationPct: calculateUtilization(creditCards),
    retirementBalance,
    retirementProjected12m: calculateRetirementProjection(retirementEntries)
  };
}

export function evaluateScenario(
  scenario: Scenario,
  netCashflow: number,
  monthlySubscriptions: number,
  creditCards: CreditCard[]
) {
  const baselineDisposable = netCashflow - monthlySubscriptions;
  const monthlyScenarioCost = scenario.durationMonths > 0 ? scenario.purchaseAmount / scenario.durationMonths : scenario.purchaseAmount;
  const cardDebt = creditCards.reduce((sum, card) => sum + card.balance, 0);
  const addedDebt = scenario.paymentType === "card" ? scenario.purchaseAmount : 0;
  return {
    baselineDisposable,
    monthlyScenarioCost,
    projectedDisposableAfterPurchase: baselineDisposable - monthlyScenarioCost,
    projectedDebt: cardDebt + addedDebt
  };
}

export function byCategory(transactions: Transaction[]) {
  const map = new Map<string, number>();
  transactions
    .filter((tx) => tx.type === "expense")
    .forEach((tx) => map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount));
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function cashflowSeries(transactions: Transaction[]) {
  const map = new Map<string, { income: number; expense: number }>();
  transactions.forEach((tx) => {
    const month = tx.date.slice(0, 7);
    const entry = map.get(month) ?? { income: 0, expense: 0 };
    if (tx.type === "income") entry.income += tx.amount;
    if (tx.type === "expense") entry.expense += tx.amount;
    map.set(month, entry);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({
      month,
      income: totals.income,
      expense: totals.expense,
      net: totals.income - totals.expense
    }));
}

export function runningBalanceSeries(transactions: Transaction[]) {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  return sorted.map((tx) => {
    running += tx.type === "income" ? tx.amount : -tx.amount;
    return { date: tx.date, balance: running };
  });
}

function formatMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function subscriptionForecastSeries(subscriptions: Subscription[], months = 12) {
  const now = new Date();
  const output: Array<{ month: string; recurringCost: number; cumulative: number }> = [];
  let cumulative = 0;
  for (let i = 0; i < months; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthCost = subscriptions.reduce((sum, sub) => {
      if (!sub.isActive) return sum;
      if (sub.frequency === "monthly") return sum + sub.cost;
      if (sub.frequency === "quarterly") return sum + (i % 3 === 0 ? sub.cost : 0);
      if (sub.frequency === "yearly") return sum + (i % 12 === 0 ? sub.cost : 0);
      return sum;
    }, 0);
    cumulative += monthCost;
    output.push({ month: formatMonth(date), recurringCost: monthCost, cumulative });
  }
  return output;
}

export function creditDebtProjectionSeries(cards: CreditCard[], months = 24) {
  let totalDebt = cards.reduce((sum, card) => sum + card.balance, 0);
  const weightedApr = cards.length
    ? cards.reduce((sum, card) => sum + card.apr * (card.balance || 1), 0) / cards.reduce((sum, card) => sum + (card.balance || 1), 0)
    : 0;
  const monthlyRate = weightedApr / 100 / 12;
  const paymentFloor = cards.reduce((sum, card) => sum + card.minPayment, 0);

  const out: Array<{ month: number; debt: number }> = [];
  for (let i = 0; i <= months; i += 1) {
    out.push({ month: i, debt: Math.max(totalDebt, 0) });
    if (totalDebt <= 0) continue;
    totalDebt = totalDebt * (1 + monthlyRate) - paymentFloor;
  }
  return out;
}

export function bankBalanceSeries(accounts: BankAccount[]) {
  const grouped = new Map<string, number>();
  accounts.forEach((account) => {
    const key = account.lastUpdated;
    grouped.set(key, (grouped.get(key) ?? 0) + account.currentBalance);
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));
}

export function retirementTrendSeries(entries: RetirementEntry[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((entry) => ({ date: entry.date, balance: entry.balance }));
}

export function scenarioSeries(scenario: Scenario, baselineDisposable: number, baselineDebt: number) {
  const out: Array<{ month: number; disposable: number; debt: number }> = [];
  const monthlyCost = scenario.durationMonths > 0 ? scenario.purchaseAmount / scenario.durationMonths : scenario.purchaseAmount;
  for (let i = 0; i <= scenario.durationMonths; i += 1) {
    const debt = scenario.paymentType === "card" ? baselineDebt + scenario.purchaseAmount - i * monthlyCost : baselineDebt;
    out.push({
      month: i,
      disposable: baselineDisposable - monthlyCost,
      debt: Math.max(debt, baselineDebt)
    });
  }
  return out;
}

export function monthlyCandlestickSeries(transactions: Transaction[]) {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const buckets = new Map<string, { open: number; close: number; high: number; low: number }>();

  sorted.forEach((tx) => {
    const month = tx.date.slice(0, 7);
    const previous = running;
    running += tx.type === "income" ? tx.amount : -tx.amount;
    const bucket = buckets.get(month);
    if (!bucket) {
      buckets.set(month, {
        open: previous,
        close: running,
        high: Math.max(previous, running),
        low: Math.min(previous, running)
      });
      return;
    }
    bucket.close = running;
    bucket.high = Math.max(bucket.high, previous, running);
    bucket.low = Math.min(bucket.low, previous, running);
  });

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values], idx) => ({
      idx,
      month,
      ...values
    }));
}

export function scenarioImpactTransactions(scenarios: Scenario[]) {
  return scenarios.flatMap((scenario) => {
    if (!scenario.isApplied || !scenario.scheduleDate) return [];
    const monthlyAmount = scenario.durationMonths > 0 ? scenario.purchaseAmount / scenario.durationMonths : scenario.purchaseAmount;
    const start = new Date(`${scenario.scheduleDate}T00:00:00`);
    return Array.from({ length: Math.max(1, scenario.durationMonths) }, (_, idx) => {
      const date = new Date(start.getFullYear(), start.getMonth() + idx, start.getDate());
      return {
        id: `scenario-${scenario.id}-${idx + 1}`,
        date: localIsoDate(date),
        amount: Number(monthlyAmount.toFixed(2)),
        type: "expense" as const,
        category: "What-If Scenario",
        merchant: scenario.name,
        account: scenario.accountId || "unassigned",
        note: `Scenario installment ${idx + 1}/${Math.max(1, scenario.durationMonths)}`,
        recurring: 0
      };
    });
  });
}

