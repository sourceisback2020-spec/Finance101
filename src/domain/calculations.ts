import type {
  BankAccount,
  Budget,
  BudgetStatus,
  CategoryVariance,
  CreditCard,
  DashboardMetrics,
  FinancialHealthScore,
  Goal,
  GoalProgress,
  HealthSubScore,
  MonthlyTrend,
  NetWorthPoint,
  RetirementEntry,
  Scenario,
  SpendingInsight,
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

export const IMPORT_CUTOFF_DATE = "2026-02-10";

export function isImportedTransaction(transaction: Transaction) {
  return transaction.id.startsWith("bank-feed:") || transaction.note.toLowerCase().includes("imported from");
}

export function isAllowedImportedDate(transaction: Transaction) {
  if (!isImportedTransaction(transaction)) return true;
  return transaction.date >= IMPORT_CUTOFF_DATE;
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
  const accountDeltasExcludingImported = transactionDeltaByAccount(transactions, localIsoDate(), { includeImported: false });
  const income = postedCashflowTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = postedCashflowTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const retirementBalance = retirementEntries[0]?.balance ?? 0;
  const totalCreditBalance = creditCards.reduce((sum, card) => sum + card.balance - (accountDeltasExcludingImported.get(card.id) ?? 0), 0);
  const totalLimit = creditCards.reduce((sum, card) => sum + card.limitAmount, 0);

  // New metrics: savings rate
  const savingsRatePct = income > 0 ? ((income - expenses) / income) * 100 : 0;

  // New metrics: top merchant
  const merchantTotals = new Map<string, number>();
  postedCashflowTransactions.filter((tx) => tx.type === "expense").forEach((tx) => {
    merchantTotals.set(tx.merchant, (merchantTotals.get(tx.merchant) ?? 0) + tx.amount);
  });
  let topMerchant: { name: string; total: number } | null = null;
  merchantTotals.forEach((total, name) => {
    if (!topMerchant || total > topMerchant.total) topMerchant = { name, total };
  });

  // New metrics: biggest expense category
  const catTotals = new Map<string, number>();
  postedCashflowTransactions.filter((tx) => tx.type === "expense").forEach((tx) => {
    catTotals.set(tx.category, (catTotals.get(tx.category) ?? 0) + tx.amount);
  });
  let biggestExpenseCategory: { name: string; total: number } | null = null;
  catTotals.forEach((total, name) => {
    if (!biggestExpenseCategory || total > biggestExpenseCategory.total) biggestExpenseCategory = { name, total };
  });

  // New metrics: next bill due
  const today = localIsoDate();
  const activeUpcoming = subscriptions
    .filter((s) => s.isActive && s.nextDueDate >= today)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const nextBill = activeUpcoming[0] ?? null;
  const daysUntilNextBill = nextBill
    ? Math.ceil((new Date(`${nextBill.nextDueDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)
    : null;

  return {
    income,
    expenses,
    netCashflow: income - expenses,
    monthlySubscriptions: calculateMonthlySubscriptionCost(subscriptions),
    totalCreditBalance,
    bankCashPosition: bankAccounts.reduce((sum, account) => {
      // SimpleFin bank balances already reflect all activity — don't add deltas
      if (account.id.startsWith("bank-feed:")) return sum + account.currentBalance;
      return sum + account.currentBalance + (accountDeltasExcludingImported.get(account.id) ?? 0);
    }, 0),
    averageUtilizationPct: totalLimit > 0 ? (totalCreditBalance / totalLimit) * 100 : 0,
    retirementBalance,
    retirementProjected12m: calculateRetirementProjection(retirementEntries),
    savingsRatePct,
    topMerchant,
    biggestExpenseCategory,
    daysUntilNextBill,
    nextBillName: nextBill?.name ?? null,
    nextBillAmount: nextBill?.cost ?? null
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

// --- Budget Statuses ---

export function calculateBudgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  asOf = localIsoDate()
): BudgetStatus[] {
  const today = new Date(`${asOf}T00:00:00`);
  return budgets
    .filter((b) => b.isActive)
    .map((budget) => {
      let periodStart: Date;
      let periodEnd: Date;
      let periodDays: number;

      if (budget.period === "weekly") {
        const dayOfWeek = today.getDay();
        periodStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek);
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 7);
        periodDays = 7;
      } else if (budget.period === "yearly") {
        periodStart = new Date(today.getFullYear(), 0, 1);
        periodEnd = new Date(today.getFullYear() + 1, 0, 1);
        periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000);
      } else {
        // monthly (default)
        periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
        periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000);
      }

      const periodStartIso = localIsoDate(periodStart);
      const periodEndIso = localIsoDate(periodEnd);

      const spent = transactions
        .filter(
          (tx) =>
            tx.type === "expense" &&
            tx.category === budget.category &&
            tx.date >= periodStartIso &&
            tx.date < periodEndIso
        )
        .reduce((sum, tx) => sum + tx.amount, 0);

      const remaining = Math.max(0, budget.amount - spent);
      const pctUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      const elapsed = Math.ceil((today.getTime() - periodStart.getTime()) / 86400000);
      const pctElapsed = periodDays > 0 ? elapsed / periodDays : 1;
      const onTrack = pctUsed <= pctElapsed * 100;

      return { budget, spent, remaining, pctUsed, onTrack };
    });
}

// --- Spending Insights ---

export function generateSpendingInsights(
  transactions: Transaction[],
  budgets: Budget[],
  subscriptions: Subscription[],
  asOf = localIsoDate()
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];
  const today = new Date(`${asOf}T00:00:00`);
  const currentMonth = asOf.slice(0, 7);

  // 1. Overspend alerts from budgets
  const statuses = calculateBudgetStatuses(budgets, transactions, asOf);
  statuses.forEach((s) => {
    if (s.pctUsed >= 100) {
      insights.push({
        type: "overspend",
        title: `Over budget: ${s.budget.category}`,
        description: `You've spent $${s.spent.toFixed(0)} of your $${s.budget.amount.toFixed(0)} ${s.budget.category} budget.`,
        severity: "warning",
        category: s.budget.category,
        amount: s.spent - s.budget.amount
      });
    } else if (s.pctUsed >= 90) {
      insights.push({
        type: "overspend",
        title: `Almost at limit: ${s.budget.category}`,
        description: `${s.pctUsed.toFixed(0)}% of your ${s.budget.category} budget used. $${s.remaining.toFixed(0)} remaining.`,
        severity: "warning",
        category: s.budget.category,
        amount: s.remaining
      });
    }
  });

  // 2. Anomaly detection via rolling averages
  const rollingAvg = categoryRollingAverage(transactions, currentMonth, 3);
  const currentSpend = new Map<string, number>();
  transactions
    .filter((tx) => tx.type === "expense" && tx.date.slice(0, 7) === currentMonth)
    .forEach((tx) => currentSpend.set(tx.category, (currentSpend.get(tx.category) ?? 0) + tx.amount));

  currentSpend.forEach((amount, category) => {
    const avg = rollingAvg.get(category) ?? 0;
    if (avg > 0 && amount > avg * 1.5) {
      insights.push({
        type: "anomaly",
        title: `Unusual spending: ${category}`,
        description: `$${amount.toFixed(0)} this month vs $${avg.toFixed(0)} average. That's ${((amount / avg) * 100 - 100).toFixed(0)}% higher.`,
        severity: "warning",
        category,
        amount
      });
    }
  });

  // 3. Savings streak
  const monthlyData = monthlySpendingTrend(transactions, 6);
  let streak = 0;
  for (let i = monthlyData.length - 1; i >= 0; i--) {
    if (monthlyData[i].savings > 0) streak++;
    else break;
  }
  if (streak >= 3) {
    insights.push({
      type: "streak",
      title: `${streak}-month savings streak!`,
      description: `You've saved money for ${streak} consecutive months. Keep it up!`,
      severity: "success"
    });
  }

  // 4. Savings opportunity: high-spend recurring merchants
  const merchantMonth = new Map<string, Set<string>>();
  transactions
    .filter((tx) => tx.type === "expense")
    .forEach((tx) => {
      const month = tx.date.slice(0, 7);
      const set = merchantMonth.get(tx.merchant) ?? new Set();
      set.add(month);
      merchantMonth.set(tx.merchant, set);
    });
  merchantMonth.forEach((months, merchant) => {
    if (months.size >= 3) {
      const total = transactions
        .filter((tx) => tx.type === "expense" && tx.merchant === merchant)
        .reduce((s, tx) => s + tx.amount, 0);
      if (total > 500) {
        insights.push({
          type: "savings-opportunity",
          title: `Review: ${merchant}`,
          description: `You've spent $${total.toFixed(0)} at ${merchant} across ${months.size} months.`,
          severity: "info",
          amount: total
        });
      }
    }
  });

  // 5. Tips when sparse data
  if (transactions.length === 0) {
    insights.push({
      type: "tip",
      title: "Get started",
      description: "Add transactions or connect SimpleFin to get personalized spending insights.",
      severity: "info"
    });
  }
  if (budgets.length === 0 && transactions.length > 0) {
    insights.push({
      type: "tip",
      title: "Set up budgets",
      description: "Create budgets to track spending limits by category.",
      severity: "info"
    });
  }

  return insights;
}

// --- Monthly Spending Trend ---

export function monthlySpendingTrend(transactions: Transaction[], months = 12): MonthlyTrend[] {
  const now = new Date();
  const result: MonthlyTrend[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    let income = 0;
    let expense = 0;
    transactions.forEach((tx) => {
      if (tx.date.slice(0, 7) !== month) return;
      if (tx.type === "income") income += tx.amount;
      if (tx.type === "expense") expense += tx.amount;
    });
    const savings = income - expense;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    result.push({ month, income, expense, savings, savingsRate });
  }
  return result;
}

// --- Spending Forecast ---

export function spendingForecast(
  trends: MonthlyTrend[]
): { nextMonthExpense: number; nextMonthIncome: number; confidence: "low" | "medium" | "high" } {
  if (trends.length < 2) {
    return { nextMonthExpense: 0, nextMonthIncome: 0, confidence: "low" };
  }

  const recent = trends.slice(-3);
  const avgExpense = recent.reduce((s, t) => s + t.expense, 0) / recent.length;
  const avgIncome = recent.reduce((s, t) => s + t.income, 0) / recent.length;

  // Variance for confidence
  const variance = recent.reduce((s, t) => s + Math.pow(t.expense - avgExpense, 2), 0) / recent.length;
  const cv = avgExpense > 0 ? Math.sqrt(variance) / avgExpense : 1;
  const confidence = cv < 0.15 ? "high" : cv < 0.35 ? "medium" : "low";

  return { nextMonthExpense: avgExpense, nextMonthIncome: avgIncome, confidence };
}

// --- Goal Progress ---

export function calculateGoalProgress(
  goals: Goal[],
  banks: BankAccount[],
  cards: CreditCard[]
): GoalProgress[] {
  const today = new Date();

  return goals
    .filter((g) => g.isActive)
    .map((goal) => {
      let currentAmount = goal.currentAmount;

      // For debt-payoff, try to use linked card balance
      if (goal.type === "debt-payoff" && goal.linkedAccountId) {
        const card = cards.find((c) => c.id === goal.linkedAccountId);
        if (card) {
          // Progress = how much debt has been paid off
          currentAmount = Math.max(0, goal.targetAmount - card.balance);
        }
      }

      // For savings goals linked to a bank account
      if (goal.type === "savings" && goal.linkedAccountId) {
        const bank = banks.find((b) => b.id === goal.linkedAccountId);
        if (bank) {
          currentAmount = bank.currentBalance;
        }
      }

      const pctComplete = goal.targetAmount > 0 ? Math.min(100, (currentAmount / goal.targetAmount) * 100) : 0;

      const deadlineDate = new Date(`${goal.deadline}T00:00:00`);
      const monthsRemaining = Math.max(
        0,
        (deadlineDate.getFullYear() - today.getFullYear()) * 12 + (deadlineDate.getMonth() - today.getMonth())
      );
      const remaining = Math.max(0, goal.targetAmount - currentAmount);
      const monthlyNeeded = monthsRemaining > 0 ? remaining / monthsRemaining : remaining;

      // Project completion date based on recent progress rate
      let projectedDate: string | null = null;
      if (currentAmount > 0 && remaining > 0) {
        // Estimate months since start
        const startDate = new Date(`${goal.deadline}T00:00:00`);
        startDate.setMonth(startDate.getMonth() - 12); // assume ~12 month horizon
        const monthsElapsed = Math.max(1, (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth()));
        const monthlyRate = currentAmount / monthsElapsed;
        if (monthlyRate > 0) {
          const monthsToGo = remaining / monthlyRate;
          const projected = new Date(today.getFullYear(), today.getMonth() + Math.ceil(monthsToGo), 1);
          projectedDate = localIsoDate(projected);
        }
      } else if (remaining <= 0) {
        projectedDate = localIsoDate(today);
      }

      const onTrack = monthsRemaining > 0 ? monthlyNeeded <= (currentAmount / Math.max(1, 12 - monthsRemaining)) * 1.1 : remaining <= 0;

      return { goal: { ...goal, currentAmount }, pctComplete, monthlyNeeded, onTrack, projectedDate };
    });
}

// --- Debt Payoff Timeline (enhanced) ---

export function debtPayoffTimeline(
  cards: CreditCard[],
  months = 36
): Array<{ month: number; totalDebt: number; interestPaid: number }> {
  let totalDebt = cards.reduce((sum, card) => sum + card.balance, 0);
  const weightedApr = cards.length
    ? cards.reduce((sum, card) => sum + card.apr * (card.balance || 1), 0) / cards.reduce((sum, card) => sum + (card.balance || 1), 0)
    : 0;
  const monthlyRate = weightedApr / 100 / 12;
  const paymentFloor = cards.reduce((sum, card) => sum + card.minPayment, 0);

  const out: Array<{ month: number; totalDebt: number; interestPaid: number }> = [];
  let cumulativeInterest = 0;

  for (let i = 0; i <= months; i++) {
    out.push({ month: i, totalDebt: Math.max(totalDebt, 0), interestPaid: cumulativeInterest });
    if (totalDebt <= 0) continue;
    const interest = totalDebt * monthlyRate;
    cumulativeInterest += interest;
    totalDebt = totalDebt + interest - paymentFloor;
  }
  return out;
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

