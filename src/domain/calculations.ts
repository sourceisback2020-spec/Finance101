import type {
  BankAccount,
  CategoryVariance,
  CreditCard,
  DashboardMetrics,
  FinancialHealthScore,
  HealthSubScore,
  NetWorthPoint,
  RetirementEntry,
  Scenario,
  Subscription,
  Transaction,
} from "./models";

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

export function isImportedTransaction(transaction: Transaction) {
  return transaction.id.startsWith("bank-feed:") || transaction.note.toLowerCase().includes("imported from");
}

export function cashflowTransactions(transactions: Transaction[], creditCards: CreditCard[]) {
  const cardIds = new Set(creditCards.map((card) => card.id));
  return transactions.filter((tx) => !cardIds.has(tx.account));
}

export function postedCashflowTransactionsAsOf(transactions: Transaction[], creditCards: CreditCard[], asOf = localIsoDate()) {
  return postedTransactionsAsOf(cashflowTransactions(transactions, creditCards), asOf);
}

export function transactionDeltaByAccount(
  transactions: Transaction[],
  asOf = localIsoDate(),
  options: { includeImported?: boolean } = {}
) {
  const includeImported = options.includeImported ?? true;
  const map = new Map<string, number>();
  postedTransactionsAsOf(transactions, asOf)
    .filter((tx) => includeImported || !isImportedTransaction(tx))
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
  const postedCashflowTransactions = postedCashflowTransactionsAsOf(transactions, creditCards);
  const accountDeltas = transactionDeltaByAccount(transactions);
  const accountDeltasExcludingImported = transactionDeltaByAccount(transactions, localIsoDate(), { includeImported: false });
  const income = postedCashflowTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = postedCashflowTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const retirementBalance = retirementEntries[0]?.balance ?? 0;
  const totalCreditBalance = creditCards.reduce((sum, card) => sum + card.balance - (accountDeltas.get(card.id) ?? 0), 0);
  const totalLimit = creditCards.reduce((sum, card) => sum + card.limitAmount, 0);
  return {
    income,
    expenses,
    netCashflow: income - expenses,
    monthlySubscriptions: calculateMonthlySubscriptionCost(subscriptions),
    totalCreditBalance,
    bankCashPosition: bankAccounts.reduce((sum, account) => sum + account.currentBalance + (accountDeltasExcludingImported.get(account.id) ?? 0), 0),
    averageUtilizationPct: totalLimit > 0 ? (totalCreditBalance / totalLimit) * 100 : 0,
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

// --- Financial Health Score ---

export function savingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return Math.max(0, Math.min(100, ((income - expenses) / income) * 100));
}

export function debtToIncomeRatio(totalDebt: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return 100;
  return Math.min(100, (totalDebt / monthlyIncome) * 100);
}

function rateSubScore(value: number, goodThreshold: number, fairThreshold: number, invert = false): Omit<HealthSubScore, "label" | "weight" | "weighted"> {
  let normalized: number;
  if (invert) {
    // Lower is better (e.g. debt-to-income, utilization)
    if (value <= goodThreshold) normalized = 100;
    else if (value >= fairThreshold) normalized = 0;
    else normalized = 100 - ((value - goodThreshold) / (fairThreshold - goodThreshold)) * 100;
  } else {
    // Higher is better (e.g. savings rate)
    if (value >= goodThreshold) normalized = 100;
    else if (value <= fairThreshold) normalized = 0;
    else normalized = ((value - fairThreshold) / (goodThreshold - fairThreshold)) * 100;
  }
  const clamped = Math.max(0, Math.min(100, normalized));
  return {
    value: clamped,
    rating: clamped >= 70 ? "good" : clamped >= 40 ? "fair" : "poor",
  };
}

export function calculateFinancialHealthScore(metrics: DashboardMetrics): FinancialHealthScore {
  const sr = savingsRate(metrics.income, metrics.expenses);
  const savingsResult = rateSubScore(sr, 20, 0); // 20%+ savings = good

  const utilization = metrics.averageUtilizationPct;
  const utilizationResult = rateSubScore(utilization, 30, 80, true); // <30% = good

  const dti = debtToIncomeRatio(metrics.totalCreditBalance, metrics.income || 1);
  const dtiResult = rateSubScore(dti, 20, 50, true); // <20% = good

  const monthsOfReserve = metrics.income > 0 ? (metrics.bankCashPosition / metrics.income) * 1 : 0; // months
  const cashReserveResult = rateSubScore(monthsOfReserve, 3, 0); // 3+ months = good

  const retirementGrowth = metrics.retirementBalance > 0
    ? ((metrics.retirementProjected12m - metrics.retirementBalance) / metrics.retirementBalance) * 100
    : 0;
  const retirementResult = rateSubScore(retirementGrowth, 7, 0); // 7%+ annual = good

  const breakdown: HealthSubScore[] = [
    { label: "Savings Rate", weight: 0.25, ...savingsResult, weighted: savingsResult.value * 0.25 },
    { label: "Credit Utilization", weight: 0.20, ...utilizationResult, weighted: utilizationResult.value * 0.20 },
    { label: "Debt-to-Income", weight: 0.20, ...dtiResult, weighted: dtiResult.value * 0.20 },
    { label: "Cash Reserve", weight: 0.20, ...cashReserveResult, weighted: cashReserveResult.value * 0.20 },
    { label: "Retirement Growth", weight: 0.15, ...retirementResult, weighted: retirementResult.value * 0.15 },
  ];

  const score = Math.round(breakdown.reduce((sum, sub) => sum + sub.weighted, 0));
  const rating = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";

  return { score, rating, breakdown };
}

// --- Spending Pulse (Month-over-Month Category Variance) ---

export function categoryRollingAverage(
  transactions: Transaction[],
  endMonth: string,
  windowMonths = 3
): Map<string, number> {
  const endDate = new Date(`${endMonth}-01T00:00:00`);
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - windowMonths, 1);
  const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;

  const map = new Map<string, number[]>();
  transactions
    .filter((tx) => tx.type === "expense")
    .filter((tx) => {
      const txMonth = tx.date.slice(0, 7);
      return txMonth >= startMonth && txMonth < endMonth;
    })
    .forEach((tx) => {
      const list = map.get(tx.category) ?? [];
      list.push(tx.amount);
      map.set(tx.category, list);
    });

  const averages = new Map<string, number>();
  map.forEach((amounts, category) => {
    averages.set(category, amounts.reduce((a, b) => a + b, 0) / windowMonths);
  });
  return averages;
}

export function categoryVarianceSeries(
  transactions: Transaction[],
  referenceMonth?: string
): CategoryVariance[] {
  const now = new Date();
  const currentMonth = referenceMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentDate = new Date(`${currentMonth}-01T00:00:00`);
  const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const rollingAvg = categoryRollingAverage(transactions, currentMonth, 3);

  const currentSpend = new Map<string, number>();
  const prevSpend = new Map<string, number>();

  transactions
    .filter((tx) => tx.type === "expense")
    .forEach((tx) => {
      const txMonth = tx.date.slice(0, 7);
      if (txMonth === currentMonth) {
        currentSpend.set(tx.category, (currentSpend.get(tx.category) ?? 0) + tx.amount);
      } else if (txMonth === prevMonth) {
        prevSpend.set(tx.category, (prevSpend.get(tx.category) ?? 0) + tx.amount);
      }
    });

  const allCategories = new Set([...currentSpend.keys(), ...prevSpend.keys()]);
  const result: CategoryVariance[] = [];

  allCategories.forEach((category) => {
    const current = currentSpend.get(category) ?? 0;
    const previous = prevSpend.get(category) ?? 0;
    const change = current - previous;
    const changePct = previous > 0 ? (change / previous) * 100 : current > 0 ? 100 : 0;
    const avg = rollingAvg.get(category) ?? 0;
    const anomaly = avg > 0 && current > avg * 1.5;

    result.push({ category, current, previous, change, changePct, anomaly });
  });

  return result.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

// --- Net Worth Timeline ---

export function netWorthSeries(
  transactions: Transaction[],
  banks: BankAccount[],
  cards: CreditCard[],
  retirementEntries: RetirementEntry[]
): NetWorthPoint[] {
  // Get the total current balances as anchors
  const totalBankBalance = banks.reduce((sum, b) => sum + b.currentBalance, 0);
  const totalCardDebt = cards.reduce((sum, c) => sum + c.balance, 0);
  const latestRetirement = retirementEntries[0]?.balance ?? 0;

  // Build monthly transaction deltas
  const monthlyDeltas = new Map<string, { bankDelta: number; cardDelta: number }>();
  const cardIds = new Set(cards.map((c) => c.id));
  const bankIds = new Set(banks.map((b) => b.id));

  transactions.forEach((tx) => {
    const month = tx.date.slice(0, 7);
    const entry = monthlyDeltas.get(month) ?? { bankDelta: 0, cardDelta: 0 };
    const delta = tx.type === "income" ? tx.amount : -tx.amount;

    if (cardIds.has(tx.account)) {
      entry.cardDelta += delta;
    } else if (bankIds.has(tx.account) || tx.account === "unassigned") {
      entry.bankDelta += delta;
    }
    monthlyDeltas.set(month, entry);
  });

  // Build retirement balance by month
  const retirementByMonth = new Map<string, number>();
  retirementEntries.forEach((entry) => {
    retirementByMonth.set(entry.date.slice(0, 7), entry.balance);
  });

  const months = [...monthlyDeltas.keys()].sort();
  if (months.length === 0) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return [{
      month: currentMonth,
      assets: totalBankBalance + latestRetirement,
      liabilities: totalCardDebt,
      net: totalBankBalance + latestRetirement - totalCardDebt,
    }];
  }

  // Work backwards from current balances to reconstruct history
  const result: NetWorthPoint[] = [];
  let runningBankDelta = 0;
  let runningCardDelta = 0;

  // Sum all deltas first
  const totalBankDelta = [...monthlyDeltas.values()].reduce((s, d) => s + d.bankDelta, 0);
  const totalCardDelta2 = [...monthlyDeltas.values()].reduce((s, d) => s + d.cardDelta, 0);

  // Start from reconstructed beginning
  let bankRunning = totalBankBalance - totalBankDelta;
  let cardRunning = totalCardDebt + totalCardDelta2; // card deltas are negative for payments

  months.forEach((month) => {
    const delta = monthlyDeltas.get(month)!;
    bankRunning += delta.bankDelta;
    cardRunning -= delta.cardDelta;

    const retirement = retirementByMonth.get(month) ?? latestRetirement;
    const assets = Math.max(0, bankRunning) + retirement;
    const liabilities = Math.max(0, cardRunning);

    result.push({
      month,
      assets,
      liabilities,
      net: assets - liabilities,
    });
  });

  return result;
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

