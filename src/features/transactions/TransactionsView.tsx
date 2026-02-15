import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Customized,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { cashflowSeries, cashflowTransactions, localIsoDate, postedTransactionsAsOf, transactionDeltaByAccount } from "../../domain/calculations";
import type { Transaction } from "../../domain/models";
import { parseTransactionsCsv } from "../../services/importExport/csv";
import { useFinanceStore } from "../../state/store";

type ChartRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
type PrimaryChartMode = "line" | "area" | "candles";
type TransactionScope = "all" | "manual" | "imported";
type TransactionTypeFilter = "all" | "income" | "expense";
const IMPORT_CUTOFF_DATE = "2026-02-12";
const TRANSACTIONS_PAGE_SIZE = 18;

function getInitialState(defaultAccount = "unassigned"): Transaction {
  return {
    id: "",
    date: localIsoDate(),
    amount: 0,
    type: "expense",
    category: "General",
    merchant: "",
    account: defaultAccount,
    note: "",
    recurring: 0
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function valueClass(value: number) {
  if (value > 0) return "value-positive";
  if (value < 0) return "value-negative";
  return "value-neutral";
}

function isImportedTransaction(transaction: Transaction) {
  return transaction.id.startsWith("bank-feed:") || transaction.note.toLowerCase().includes("imported from");
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  if (!year || !monthNumber) return month;
  return `${monthNumber}/${year.slice(-2)}`;
}

function formatDateLabel(date: string, range: ChartRange) {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  if (range === "1M" || range === "3M") {
    return `${month}/${day}`;
  }
  return `${month}/${year.slice(-2)}`;
}

function compressBalanceSeriesForLongRange(points: Array<{ date: string; balance: number }>, range: ChartRange) {
  if ((range === "1Y" || range === "ALL") && points.length > 90) {
    const byMonth = new Map<string, { date: string; balance: number }>();
    points.forEach((point) => {
      byMonth.set(point.date.slice(0, 7), point);
    });
    return [...byMonth.values()];
  }
  return points;
}

function stretchBalanceSeriesWindow(
  points: Array<{ date: string; balance: number }>,
  startIso: string | null,
  endIso: string | null,
  fallbackBalance: number
) {
  if (!startIso || !endIso) return points;
  if (points.length === 0) {
    if (startIso === endIso) return [{ date: startIso, balance: fallbackBalance }];
    return [
      { date: startIso, balance: fallbackBalance },
      { date: endIso, balance: fallbackBalance }
    ];
  }
  const stretched = [...points];
  if (stretched[0].date > startIso) {
    stretched.unshift({ date: startIso, balance: stretched[0].balance });
  }
  const last = stretched[stretched.length - 1];
  if (last.date < endIso) {
    stretched.push({ date: endIso, balance: last.balance });
  }
  return stretched;
}

function rangeStart(range: ChartRange, todayIso: string) {
  if (range === "ALL") return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const monthsBack = range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : 12;
  return new Date(today.getFullYear(), today.getMonth() - monthsBack, today.getDate());
}

function rangeProjectionEnd(range: ChartRange, todayIso: string) {
  if (range === "ALL") return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const monthsForward = range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : 12;
  return new Date(today.getFullYear(), today.getMonth() + monthsForward, today.getDate());
}

type CandlePoint = {
  idx: number;
  label: string;
  open: number;
  close: number;
  high: number;
  low: number;
};

function CandleLayer({
  candles,
  xAxisMap,
  yAxisMap
}: {
  candles: CandlePoint[];
  xAxisMap?: unknown;
  yAxisMap?: unknown;
}) {
  const resolveFirstAxis = (axisMap: unknown) => {
    if (!axisMap) return null;
    if (axisMap instanceof Map) {
      return axisMap.values().next().value ?? null;
    }
    if (Array.isArray(axisMap)) return axisMap[0] ?? null;
    return Object.values(axisMap as Record<string, unknown>)[0] ?? null;
  };
  const resolveScale = (axis: unknown) => {
    const candidate = axis as { scale?: unknown };
    if (!candidate?.scale) return null;
    if (typeof candidate.scale === "function") return candidate.scale as (value: number) => number;
    const nested = candidate.scale as { scale?: unknown };
    if (typeof nested?.scale === "function") return nested.scale as (value: number) => number;
    return null;
  };

  const xAxis = resolveFirstAxis(xAxisMap);
  const yAxis = resolveFirstAxis(yAxisMap);
  const xScale = resolveScale(xAxis);
  const yScale = resolveScale(yAxis);
  if (!xScale || !yScale || candles.length === 0) return null;

  const bodyWidth = 8;
  return (
    <g>
      {candles.map((candle) => {
        const x = xScale(candle.idx);
        const yHigh = yScale(candle.high);
        const yLow = yScale(candle.low);
        const yOpen = yScale(candle.open);
        const yClose = yScale(candle.close);
        if (![x, yHigh, yLow, yOpen, yClose].every((value) => Number.isFinite(value))) {
          return null;
        }
        const isBull = candle.close >= candle.open;
        const bodyStroke = isBull ? "#56d3a1" : "#ff8a92";
        const bodyFill = isBull ? "rgba(86,211,161,0.35)" : "rgba(255,138,146,0.35)";
        const isDoji = Math.abs(candle.close - candle.open) < 0.01;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));

        return (
          <g key={`candle-${candle.label}-${candle.idx}`}>
            <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={bodyStroke} strokeWidth={1.4} />
            {isDoji ? (
              <line x1={x - bodyWidth / 2} y1={yOpen} x2={x + bodyWidth / 2} y2={yOpen} stroke="#67b2ff" strokeWidth={2} />
            ) : (
              <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={bodyFill} stroke={bodyStroke} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function buildCashflowCandlesForRange(
  transactions: Transaction[],
  startIso: string | null,
  endIso: string | null
): CandlePoint[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const start = startIso ?? (sorted[0]?.date ?? localIsoDate());
  const end = endIso ?? (sorted[sorted.length - 1]?.date ?? localIsoDate());
  if (start > end) return [];

  let running = sorted
    .filter((tx) => tx.date < start)
    .reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0);

  const inRange = sorted.filter((tx) => tx.date >= start && tx.date <= end);
  const dailyMap = inRange.reduce<Map<string, Transaction[]>>((map, tx) => {
    const list = map.get(tx.date) ?? [];
    list.push(tx);
    map.set(tx.date, list);
    return map;
  }, new Map<string, Transaction[]>());

  const firstRealDate = inRange[0]?.date;
  if (!firstRealDate) return [];
  const seriesStart = firstRealDate;
  if (seriesStart > end) return [];

  const output: CandlePoint[] = [];
  let cursor = seriesStart;
  let idx = 0;
  while (cursor <= end) {
    const dayTransactions = (dailyMap.get(cursor) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    const open = running;
    let high = open;
    let low = open;
    dayTransactions.forEach((tx) => {
      running += tx.type === "income" ? tx.amount : -tx.amount;
      high = Math.max(high, running);
      low = Math.min(low, running);
    });
    const close = running;
    output.push({
      idx,
      label: cursor,
      open,
      close,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close)
    });
    idx += 1;
    cursor = addDays(cursor, 1);
  }
  return output;
}

function buildBalanceCandlesForRange(
  points: Array<{ date: string; balance: number }>,
  startIso: string | null,
  endIso: string | null,
  todayIso: string
): CandlePoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const hardStart = startIso ?? sorted[0].date;
  const hardEnd = endIso ?? sorted[sorted.length - 1].date;
  const firstKnown = sorted[0].date;
  const firstVisible = firstKnown > hardStart ? firstKnown : hardStart;
  const seriesStart = firstVisible <= todayIso && todayIso <= hardEnd ? firstVisible : firstVisible;
  if (seriesStart > hardEnd) return [];

  const byDate = new Map<string, number>();
  sorted.forEach((point) => byDate.set(point.date, point.balance));
  const startSeed =
    [...sorted].reverse().find((point) => point.date <= seriesStart)?.balance ??
    sorted[0].balance;

  const output: CandlePoint[] = [];
  let cursor = seriesStart;
  let idx = 0;
  let previousClose = startSeed;
  while (cursor <= hardEnd) {
    const close = byDate.get(cursor) ?? previousClose;
    output.push({
      idx,
      label: cursor,
      open: previousClose,
      close,
      high: Math.max(previousClose, close),
      low: Math.min(previousClose, close)
    });
    previousClose = close;
    cursor = addDays(cursor, 1);
    idx += 1;
  }
  return output;
}

export function TransactionsView() {
  const transactions = useFinanceStore((state) => state.transactions);
  const manualTransactions = useFinanceStore((state) => state.manualTransactions);
  const banks = useFinanceStore((state) => state.banks);
  const cards = useFinanceStore((state) => state.cards);
  const upsertTransaction = useFinanceStore((state) => state.upsertTransaction);
  const deleteTransaction = useFinanceStore((state) => state.deleteTransaction);
  const bulkInsert = useFinanceStore((state) => state.bulkInsertTransactions);
  const [form, setForm] = useState<Transaction>(getInitialState(banks[0]?.id ?? "unassigned"));
  const [query, setQuery] = useState("");
  const [chartRange, setChartRange] = useState<ChartRange>("6M");
  const [primaryChartMode, setPrimaryChartMode] = useState<PrimaryChartMode>("line");
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showNet, setShowNet] = useState(true);
  const [transactionScope, setTransactionScope] = useState<TransactionScope>("all");
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState(IMPORT_CUTOFF_DATE);
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const isEditing = Boolean(form.id);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    manualTransactions.forEach((tx) => values.add(tx.category));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [manualTransactions]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return manualTransactions
      .filter((tx) => tx.date >= IMPORT_CUTOFF_DATE || !isImportedTransaction(tx))
      .filter((tx) => {
        if (transactionScope === "manual") return !isImportedTransaction(tx);
        if (transactionScope === "imported") return isImportedTransaction(tx);
        return true;
      })
      .filter((tx) => (typeFilter === "all" ? true : tx.type === typeFilter))
      .filter((tx) => (accountFilter === "all" ? true : tx.account === accountFilter))
      .filter((tx) => (categoryFilter === "all" ? true : tx.category === categoryFilter))
      .filter((tx) => (fromDate ? tx.date >= fromDate : true))
      .filter((tx) => (toDate ? tx.date <= toDate : true))
      .filter((tx) => `${tx.date} ${tx.category} ${tx.merchant} ${tx.note}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const dateSort = b.date.localeCompare(a.date);
        if (dateSort !== 0) return dateSort;
        const importedSort = Number(isImportedTransaction(b)) - Number(isImportedTransaction(a));
        if (importedSort !== 0) return importedSort;
        return b.id.localeCompare(a.id);
      });
  }, [manualTransactions, query, transactionScope, typeFilter, accountFilter, categoryFilter, fromDate, toDate]);

  useEffect(() => {
    setPage(0);
  }, [query, transactionScope, typeFilter, accountFilter, categoryFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TRANSACTIONS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedTransactions = useMemo(() => {
    const start = currentPage * TRANSACTIONS_PAGE_SIZE;
    return filtered.slice(start, start + TRANSACTIONS_PAGE_SIZE);
  }, [filtered, currentPage]);

  const heatmapRows = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number }>();
    filtered.forEach((tx) => {
      const row = map.get(tx.category) ?? { income: 0, expense: 0, count: 0 };
      if (tx.type === "income") row.income += tx.amount;
      if (tx.type === "expense") row.expense += tx.amount;
      row.count += 1;
      map.set(tx.category, row);
    });
    return [...map.entries()]
      .map(([category, totals]) => ({ category, ...totals }))
      .sort((a, b) => (b.expense + b.income) - (a.expense + a.income))
      .slice(0, 12);
  }, [filtered]);
  const maxHeatAmount = Math.max(1, ...heatmapRows.map((row) => Math.max(row.expense, row.income)));
  const cashflowTx = useMemo(() => cashflowTransactions(transactions, cards), [transactions, cards]);
  const monthlySeries = useMemo(() => cashflowSeries(cashflowTx), [cashflowTx]);
  const today = localIsoDate();
  const start = rangeStart(chartRange, today);
  const projectionEnd = rangeProjectionEnd(chartRange, today);
  const startIso = start ? localIsoDate(start) : null;
  const endIso = projectionEnd ? localIsoDate(projectionEnd) : null;
  const postedCashflow = useMemo(() => postedTransactionsAsOf(cashflowTx, today), [cashflowTx, today]);
  const postedByAccountWithoutImported = useMemo(
    () => transactionDeltaByAccount(transactions, today, { includeImported: false }),
    [transactions, today]
  );
  const liveCashAnchor = useMemo(
    () => banks.reduce((sum, bank) => sum + bank.currentBalance + (postedByAccountWithoutImported.get(bank.id) ?? 0), 0),
    [banks, postedByAccountWithoutImported]
  );
  const balanceSeries = useMemo(() => {
    const byDate = postedCashflow.reduce<Map<string, number>>((map, tx) => {
      const delta = tx.type === "income" ? tx.amount : -tx.amount;
      map.set(tx.date, (map.get(tx.date) ?? 0) + delta);
      return map;
    }, new Map<string, number>());
    const dailyRows = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, delta]) => ({ date, delta }));
    let running = 0;
    const cumulative = dailyRows.map((row) => {
      running += row.delta;
      return { date: row.date, running };
    });
    const lastRunning = cumulative[cumulative.length - 1]?.running ?? 0;
    const offset = liveCashAnchor - lastRunning;
    return cumulative.map((row) => ({ date: row.date, balance: row.running + offset }));
  }, [postedCashflow, liveCashAnchor]);
  const scheduled = useMemo(
    () => [...transactions].filter((tx) => tx.date > today).sort((a, b) => a.date.localeCompare(b.date)),
    [transactions, today]
  );
  const filteredMonthlySeries = useMemo(
    () =>
      startIso
        ? monthlySeries.filter((point) => point.month >= startIso.slice(0, 7) && point.month <= (endIso?.slice(0, 7) ?? point.month))
        : monthlySeries,
    [monthlySeries, startIso, endIso]
  );
  const projectedBalanceSeries = useMemo(() => {
    const byFutureDate = cashflowTx
      .filter((tx) => tx.date > today)
      .reduce<Map<string, number>>((map, tx) => {
        const delta = tx.type === "income" ? tx.amount : -tx.amount;
        map.set(tx.date, (map.get(tx.date) ?? 0) + delta);
        return map;
      }, new Map<string, number>());

    const futureRows = [...byFutureDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, delta]) => ({ date, delta }));

    let running = balanceSeries[balanceSeries.length - 1]?.balance ?? liveCashAnchor;
    const projectedFuture = futureRows.map((row) => {
      running += row.delta;
      return { date: row.date, balance: running };
    });
    return [...balanceSeries, ...projectedFuture];
  }, [cashflowTx, today, balanceSeries, liveCashAnchor]);
  const filteredBalanceSeries = useMemo(
    () =>
      startIso && endIso
        ? projectedBalanceSeries.filter((point) => point.date >= startIso && point.date <= endIso)
        : projectedBalanceSeries,
    [projectedBalanceSeries, startIso, endIso]
  );
  const cashflowCandleSeries = useMemo(
    () => (primaryChartMode === "candles" ? buildCashflowCandlesForRange(cashflowTx, startIso, endIso) : []),
    [primaryChartMode, cashflowTx, startIso, endIso]
  );
  const displayBalanceSeries = useMemo(
    () =>
      compressBalanceSeriesForLongRange(
        stretchBalanceSeriesWindow(filteredBalanceSeries, startIso, endIso, liveCashAnchor),
        chartRange
      ),
    [filteredBalanceSeries, chartRange, startIso, endIso, liveCashAnchor]
  );
  const balanceCandleSeries = useMemo(
    () => (primaryChartMode === "candles" ? buildBalanceCandlesForRange(filteredBalanceSeries, startIso, endIso, today) : []),
    [primaryChartMode, filteredBalanceSeries, startIso, endIso, today]
  );
  const cashflowCandleLabelByIdx = useMemo(
    () => new Map(cashflowCandleSeries.map((point) => [point.idx, point.label])),
    [cashflowCandleSeries]
  );
  const balanceCandleLabelByIdx = useMemo(
    () => new Map(balanceCandleSeries.map((point) => [point.idx, point.label])),
    [balanceCandleSeries]
  );
  const hasCashflowSeries = filteredMonthlySeries.length >= 1;
  const hasCashflowCandles = cashflowCandleSeries.length >= 1;
  const hasBalanceCandles = balanceCandleSeries.length >= 1;
  const canRenderPrimaryChart = primaryChartMode === "candles" ? hasCashflowCandles : hasCashflowSeries;
  const hasBalanceSeries = displayBalanceSeries.length >= 2;
  const canRenderBalanceChart = primaryChartMode === "candles" ? hasBalanceCandles : hasBalanceSeries;
  const bankNameById = useMemo(
    () =>
      banks.reduce<Record<string, string>>((acc, bank) => {
        acc[bank.id] = `${bank.institution} - ${bank.nickname}`;
        return acc;
      }, {}),
    [banks]
  );
  const cardNameById = useMemo(
    () =>
      cards.reduce<Record<string, string>>((acc, card) => {
        acc[card.id] = `Card - ${card.name}`;
        return acc;
      }, {}),
    [cards]
  );
  const accountLabel = useMemo(
    () => (accountId: string) => {
      if (bankNameById[accountId]) return bankNameById[accountId];
      if (cardNameById[accountId]) return cardNameById[accountId];
      if (accountId.startsWith("bank-feed:")) return "Imported Bank Account";
      return accountId;
    },
    [bankNameById, cardNameById]
  );
  const postedIncome = useMemo(
    () => postedCashflow.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0),
    [postedCashflow]
  );
  const postedExpenses = useMemo(
    () => postedCashflow.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0),
    [postedCashflow]
  );
  const pendingNet = useMemo(
    () => scheduled.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0),
    [scheduled]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await upsertTransaction({ ...form, id: form.id || crypto.randomUUID() });
    setForm(getInitialState(banks[0]?.id ?? "unassigned"));
  }

  async function postNow(transaction: Transaction) {
    await upsertTransaction({ ...transaction, date: today });
  }

  async function onCsvImport(file: File) {
    const text = await file.text();
    const rows = parseTransactionsCsv(text);
    const rowsInRange = rows.filter((row) => row.date >= IMPORT_CUTOFF_DATE);
    if (rowsInRange.length > 0) {
      await bulkInsert(rowsInRange);
    }
  }

  return (
    <section className="stack-lg">
      <header>
        <h2>Transactions</h2>
        <p className="muted">Track every transaction, categorize spending, and import history from CSV.</p>
      </header>

      <div className="kpi-grid">
        <article className="kpi-card"><h3>Posted Income</h3><strong className="value-positive">{money(postedIncome)}</strong></article>
        <article className="kpi-card"><h3>Posted Expenses</h3><strong className="value-negative">{money(postedExpenses)}</strong></article>
        <article className="kpi-card"><h3>Posted Net</h3><strong className={valueClass(postedIncome - postedExpenses)}>{money(postedIncome - postedExpenses)}</strong></article>
        <article className="kpi-card"><h3>Scheduled Impact</h3><strong className={valueClass(pendingNet)}>{money(pendingNet)}</strong></article>
        <article className="kpi-card"><h3>Scheduled Count</h3><strong>{scheduled.length}</strong></article>
      </div>

      <article className="panel">
        <h3>{isEditing ? "Edit Transaction" : "Add Transaction"}</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></label>
          <label>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Transaction["type"] })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label>Merchant<input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} /></label>
          <label>Account
            <select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
              <option value="unassigned">Unassigned / Cash</option>
              <optgroup label="Bank Accounts">
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.institution} - {bank.nickname}
                </option>
              ))}
              </optgroup>
              <optgroup label="Credit Cards">
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  Card - {card.name}
                </option>
              ))}
              </optgroup>
            </select>
          </label>
          <label>Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(form.recurring)} onChange={(e) => setForm({ ...form, recurring: e.target.checked ? 1 : 0 })} />
            Recurring
          </label>
          <div className="row-actions">
            <button type="submit">{isEditing ? "Update" : "Save"}</button>
            {isEditing ? (
              <button type="button" onClick={() => setForm(getInitialState(banks[0]?.id ?? "unassigned"))}>
                Cancel
              </button>
            ) : null}
            <label className="secondary-btn">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onCsvImport(file);
                }}
              />
            </label>
          </div>
        </form>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>Cashflow and Running Balance</h3>
          <div className="chart-toolbar">
            <div className="toggle-group">
              {(["1M", "3M", "6M", "1Y", "ALL"] as ChartRange[]).map((range) => (
                <button
                  key={range}
                  className={`chip-btn ${chartRange === range ? "active-chip" : ""}`}
                  onClick={() => setChartRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
            <div className="toggle-group">
              <button className={`chip-btn ${showIncome ? "active-chip" : ""}`} onClick={() => setShowIncome((v) => !v)}>Income</button>
              <button className={`chip-btn ${showExpense ? "active-chip" : ""}`} onClick={() => setShowExpense((v) => !v)}>Expense</button>
              <button className={`chip-btn ${showNet ? "active-chip" : ""}`} onClick={() => setShowNet((v) => !v)}>Net</button>
              <button className={`chip-btn ${primaryChartMode === "line" ? "active-chip" : ""}`} onClick={() => setPrimaryChartMode("line")}>Line</button>
              <button className={`chip-btn ${primaryChartMode === "area" ? "active-chip" : ""}`} onClick={() => setPrimaryChartMode("area")}>Area</button>
              <button className={`chip-btn ${primaryChartMode === "candles" ? "active-chip" : ""}`} onClick={() => setPrimaryChartMode("candles")}>Candles</button>
            </div>
          </div>
        </div>
        <div className="chart-grid">
          <div className="chart-panel">
            {canRenderPrimaryChart ? (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={180}>
                  {primaryChartMode === "area" ? (
                    <AreaChart data={filteredMonthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                    <XAxis dataKey="month" tickFormatter={formatMonthLabel} minTickGap={20} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => money(typeof value === "number" ? value : Number(value))} contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Legend />
                      {showIncome && <Area type="monotone" dataKey="income" stroke="#56d3a1" fill="rgba(86,211,161,0.2)" strokeWidth={2} isAnimationActive={false} />}
                      {showExpense && <Area type="monotone" dataKey="expense" stroke="#ff8a92" fill="rgba(255,138,146,0.2)" strokeWidth={2} isAnimationActive={false} />}
                      {showNet && <Area type="monotone" dataKey="net" stroke="#67b2ff" fill="rgba(103,178,255,0.18)" strokeWidth={2} isAnimationActive={false} />}
                    </AreaChart>
                  ) : primaryChartMode === "line" ? (
                    <LineChart data={filteredMonthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis dataKey="month" tickFormatter={formatMonthLabel} minTickGap={20} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => money(typeof value === "number" ? value : Number(value))} contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Legend />
                      {showIncome && <Line type="monotone" dataKey="income" stroke="#56d3a1" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showExpense && <Line type="monotone" dataKey="expense" stroke="#ff8a92" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showNet && <Line type="monotone" dataKey="net" stroke="#67b2ff" dot={false} strokeWidth={2} isAnimationActive={false} />}
                    </LineChart>
                  ) : hasCashflowCandles ? (
                    <ComposedChart data={cashflowCandleSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis
                        type="number"
                        dataKey="idx"
                        domain={["dataMin - 1", "dataMax + 1"]}
                        tickCount={Math.min(8, cashflowCandleSeries.length)}
                        tickFormatter={(idx) => {
                          const label = cashflowCandleLabelByIdx.get(Number(idx)) ?? "";
                          return formatDateLabel(label, chartRange);
                        }}
                        tick={{ fill: "#9fb8e9", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value) => money(typeof value === "number" ? value : Number(value))}
                        contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }}
                        labelFormatter={(label) => cashflowCandleLabelByIdx.get(Number(label)) ?? ""}
                      />
                      <Line type="monotone" dataKey="close" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false} />
                      <Customized component={(props: Record<string, unknown>) => <CandleLayer candles={cashflowCandleSeries} {...props} />} />
                    </ComposedChart>
                  ) : (
                    <LineChart data={filteredMonthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis dataKey="month" tickFormatter={formatMonthLabel} minTickGap={20} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => money(typeof value === "number" ? value : Number(value))} contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Legend />
                      {showIncome && <Line type="monotone" dataKey="income" stroke="#56d3a1" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showExpense && <Line type="monotone" dataKey="expense" stroke="#ff8a92" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showNet && <Line type="monotone" dataKey="net" stroke="#67b2ff" dot={false} strokeWidth={2} isAnimationActive={false} />}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : primaryChartMode === "candles" ? (
              <div className="chart-empty">No candlestick buckets in this timeframe yet. Expand range or add transactions.</div>
            ) : (
              <div className="chart-empty">Add transactions from at least 2 different months to render the trend chart.</div>
            )}
          </div>
          <div className="chart-panel">
            {canRenderBalanceChart ? (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={180}>
                  {primaryChartMode === "candles" ? (
                    <ComposedChart data={balanceCandleSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis
                        type="number"
                        dataKey="idx"
                        domain={["dataMin - 1", "dataMax + 1"]}
                        tickCount={Math.min(8, balanceCandleSeries.length)}
                        tickFormatter={(idx) => {
                          const label = balanceCandleLabelByIdx.get(Number(idx)) ?? "";
                          return formatDateLabel(label, chartRange);
                        }}
                        tick={{ fill: "#9fb8e9", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value) => money(typeof value === "number" ? value : Number(value))}
                        contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }}
                        labelFormatter={(label) => balanceCandleLabelByIdx.get(Number(label)) ?? ""}
                      />
                      <Line type="monotone" dataKey="close" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false} />
                      <Customized component={(props: Record<string, unknown>) => <CandleLayer candles={balanceCandleSeries} {...props} />} />
                    </ComposedChart>
                  ) : (
                    <LineChart data={displayBalanceSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDateLabel(String(value), chartRange)}
                        minTickGap={24}
                        tick={{ fill: "#9fb8e9", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => money(typeof value === "number" ? value : Number(value))} contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Line type="monotone" dataKey="balance" stroke="#ffb26b" dot={false} strokeWidth={2.5} isAnimationActive={false} />
                      <ReferenceLine x={today} stroke="rgba(103,178,255,0.65)" strokeDasharray="4 4" />
                      {displayBalanceSeries.length > 18 ? <Brush dataKey="date" height={18} stroke="#2f61c0" travellerWidth={8} /> : null}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : primaryChartMode === "candles" ? (
              <div className="chart-empty">No candlestick buckets in this timeframe yet. Expand range or add transactions.</div>
            ) : (
              <div className="chart-empty">Add at least 2 transactions to visualize running balance movement.</div>
            )}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>Scheduled Transactions ({scheduled.length})</h3>
          <strong>{money(scheduled.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0))} pending impact</strong>
        </div>
        {scheduled.length === 0 ? (
          <div className="chart-empty">No future-dated transactions. Add one to track upcoming paychecks and bills.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Account</th><th />
                </tr>
              </thead>
              <tbody>
                {scheduled.map((tx) => (
                  <tr key={tx.id} className={tx.type === "income" ? "row-income" : "row-expense"}>
                    <td>{tx.date}</td>
                    <td className={tx.type === "income" ? "value-positive" : "value-negative"}>{tx.type}</td>
                    <td>{tx.category}</td>
                    <td className={tx.type === "income" ? "value-positive" : "value-negative"}>{money(tx.amount)}</td>
                    <td>{accountLabel(tx.account)}</td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => void postNow(tx)}>Post Now</button>
                        <button type="button" onClick={() => setForm(tx)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>Transaction Heatmap (Category x Type)</h3>
          <strong>Top {heatmapRows.length} categories</strong>
        </div>
        {heatmapRows.length === 0 ? (
          <div className="chart-empty">No transactions in this filter range yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th><th>Expense</th><th>Income</th><th>Count</th>
                </tr>
              </thead>
              <tbody>
                {heatmapRows.map((row) => {
                  const expenseAlpha = Math.min(0.75, row.expense / maxHeatAmount);
                  const incomeAlpha = Math.min(0.75, row.income / maxHeatAmount);
                  return (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td
                        style={{ background: `rgba(255,138,146,${expenseAlpha})` }}
                        className={row.expense > 0 ? "value-negative" : "value-neutral"}
                      >
                        {money(row.expense)}
                      </td>
                      <td
                        style={{ background: `rgba(86,211,161,${incomeAlpha})` }}
                        className={row.income > 0 ? "value-positive" : "value-neutral"}
                      >
                        {money(row.income)}
                      </td>
                      <td>{row.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>Transactions ({filtered.length})</h3>
          <div className="chart-toolbar">
            <div className="toggle-group">
              {(["all", "manual", "imported"] as TransactionScope[]).map((scope) => (
                <button
                  key={scope}
                  className={`chip-btn ${transactionScope === scope ? "active-chip" : ""}`}
                  onClick={() => setTransactionScope(scope)}
                >
                  {scope === "all" ? "All" : scope === "manual" ? "Manual" : "Imported"}
                </button>
              ))}
            </div>
            <input placeholder="Search date, category, merchant, notes..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="form-grid">
          <label>
            Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TransactionTypeFilter)}>
              <option value="all">All</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Account
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">All accounts</option>
              <optgroup label="Bank Accounts">
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.institution} - {bank.nickname}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Credit Cards">
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    Card - {card.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Category
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Category</th><th>Merchant</th><th>Amount</th><th>Account</th><th />
              </tr>
            </thead>
            <tbody>
              {pagedTransactions.map((tx) => (
                <tr key={tx.id} className={tx.type === "income" ? "row-income" : "row-expense"}>
                  <td>{tx.date}</td>
                  <td className={tx.type === "income" ? "value-positive" : "value-negative"}>{tx.type}</td>
                  <td>{tx.category}</td>
                  <td>{tx.merchant || "-"}</td>
                  <td className={tx.type === "income" ? "value-positive" : "value-negative"}>{money(tx.amount)}</td>
                  <td>{accountLabel(tx.account)}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => setForm(tx)}>Edit</button>
                      <button className="danger-btn" onClick={() => void deleteTransaction(tx.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions">
          <strong>Page {currentPage + 1} / {totalPages}</strong>
          <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>
            Previous
          </button>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={currentPage >= totalPages - 1}>
            Next
          </button>
        </div>
      </article>
    </section>
  );
}

