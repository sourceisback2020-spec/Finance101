import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { cashflowSeries, localIsoDate, monthlyCandlestickSeries, runningBalanceSeries } from "../../domain/calculations";
import type { Transaction } from "../../domain/models";
import { parseTransactionsCsv } from "../../services/importExport/csv";
import { useFinanceStore } from "../../state/store";

type ChartRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
type PrimaryChartMode = "line" | "area" | "candles";

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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function valueClass(value: number) {
  if (value > 0) return "value-positive";
  if (value < 0) return "value-negative";
  return "value-neutral";
}

function rangeStart(range: ChartRange, todayIso: string) {
  if (range === "ALL") return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const monthsBack = range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : 12;
  return new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
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

  const filtered = useMemo(
    () =>
      manualTransactions.filter((tx) =>
        `${tx.category} ${tx.merchant} ${tx.note}`.toLowerCase().includes(query.toLowerCase())
      ),
    [manualTransactions, query]
  );
  const monthlySeries = useMemo(() => cashflowSeries(transactions), [transactions]);
  const candleSeries = useMemo(() => monthlyCandlestickSeries(transactions), [transactions]);
  const balanceSeries = useMemo(() => runningBalanceSeries(transactions), [transactions]);
  const today = localIsoDate();
  const scheduled = useMemo(
    () => [...transactions].filter((tx) => tx.date > today).sort((a, b) => a.date.localeCompare(b.date)),
    [transactions, today]
  );
  const start = rangeStart(chartRange, today);
  const filteredMonthlySeries = useMemo(
    () =>
      start
        ? monthlySeries.filter((point) => new Date(`${point.month}-01T00:00:00`) >= start)
        : monthlySeries,
    [monthlySeries, start]
  );
  const filteredBalanceSeries = useMemo(
    () => (start ? balanceSeries.filter((point) => new Date(`${point.date}T00:00:00`) >= start) : balanceSeries),
    [balanceSeries, start]
  );
  const filteredCandleSeries = useMemo(
    () =>
      start
        ? candleSeries.filter((point) => new Date(`${point.month}-01T00:00:00`) >= start)
        : candleSeries,
    [candleSeries, start]
  );
  const hasCashflowSeries = filteredMonthlySeries.length >= 2;
  const hasCandles = filteredCandleSeries.length >= 2;
  const hasBalanceSeries = filteredBalanceSeries.length >= 2;
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
  const postedIncome = useMemo(
    () => transactions.filter((tx) => tx.type === "income" && tx.date <= today).reduce((sum, tx) => sum + tx.amount, 0),
    [transactions, today]
  );
  const postedExpenses = useMemo(
    () => transactions.filter((tx) => tx.type === "expense" && tx.date <= today).reduce((sum, tx) => sum + tx.amount, 0),
    [transactions, today]
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
    if (rows.length > 0) {
      await bulkInsert(rows);
    }
  }

  return (
    <section className="stack-lg">
      <header>
        <h2>Income & Expenses</h2>
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
        <h3>Add Transaction</h3>
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
            <button type="submit">Save</button>
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
            {hasCashflowSeries ? (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={220}>
                  {primaryChartMode === "area" ? (
                    <AreaChart data={filteredMonthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Legend />
                      {showIncome && <Area type="monotone" dataKey="income" stroke="#56d3a1" fill="rgba(86,211,161,0.2)" strokeWidth={2} isAnimationActive={false} />}
                      {showExpense && <Area type="monotone" dataKey="expense" stroke="#ff8a92" fill="rgba(255,138,146,0.2)" strokeWidth={2} isAnimationActive={false} />}
                      {showNet && <Area type="monotone" dataKey="net" stroke="#67b2ff" fill="rgba(103,178,255,0.18)" strokeWidth={2} isAnimationActive={false} />}
                    </AreaChart>
                  ) : primaryChartMode === "line" ? (
                    <LineChart data={filteredMonthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Legend />
                      {showIncome && <Line type="monotone" dataKey="income" stroke="#56d3a1" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showExpense && <Line type="monotone" dataKey="expense" stroke="#ff8a92" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showNet && <Line type="monotone" dataKey="net" stroke="#67b2ff" dot={false} strokeWidth={2} isAnimationActive={false} />}
                    </LineChart>
                  ) : hasCandles ? (
                    <ComposedChart data={filteredCandleSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis
                        type="number"
                        dataKey="idx"
                        domain={["dataMin - 1", "dataMax + 1"]}
                        tickCount={Math.min(8, filteredCandleSeries.length)}
                        tickFormatter={(idx) => filteredCandleSeries.find((point) => point.idx === Number(idx))?.month ?? ""}
                        tick={{ fill: "#9fb8e9", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }}
                        labelFormatter={(label) => filteredCandleSeries.find((point) => point.idx === Number(label))?.month ?? ""}
                      />
                      <Line type="monotone" dataKey="close" stroke="transparent" dot={false} isAnimationActive={false} />
                      {filteredCandleSeries.map((candle) => (
                        <ReferenceLine
                          key={`wick-${candle.month}`}
                          segment={[
                            { x: candle.idx, y: candle.low },
                            { x: candle.idx, y: candle.high }
                          ]}
                          stroke={candle.close >= candle.open ? "#56d3a1" : "#ff8a92"}
                          strokeWidth={1.4}
                        />
                      ))}
                      {filteredCandleSeries.map((candle) => (
                        <ReferenceArea
                          key={`body-${candle.month}`}
                          x1={candle.idx - 0.28}
                          x2={candle.idx + 0.28}
                          y1={candle.open}
                          y2={candle.close === candle.open ? candle.close + 0.0001 : candle.close}
                          fill={candle.close >= candle.open ? "rgba(86,211,161,0.35)" : "rgba(255,138,146,0.35)"}
                          stroke={candle.close >= candle.open ? "#56d3a1" : "#ff8a92"}
                        />
                      ))}
                    </ComposedChart>
                  ) : (
                    <LineChart data={filteredMonthlySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                      <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                      <Legend />
                      {showIncome && <Line type="monotone" dataKey="income" stroke="#56d3a1" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showExpense && <Line type="monotone" dataKey="expense" stroke="#ff8a92" dot={false} strokeWidth={2} isAnimationActive={false} />}
                      {showNet && <Line type="monotone" dataKey="net" stroke="#67b2ff" dot={false} strokeWidth={2} isAnimationActive={false} />}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="chart-empty">Add transactions from at least 2 different months to render the trend chart.</div>
            )}
          </div>
          <div className="chart-panel">
            {hasBalanceSeries ? (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={filteredBalanceSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                    <XAxis dataKey="date" hide={filteredBalanceSeries.length > 14} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                    <Line type="monotone" dataKey="balance" stroke="#ffb26b" dot={false} strokeWidth={2.5} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                    <td>{bankNameById[tx.account] ?? cardNameById[tx.account] ?? tx.account}</td>
                    <td><button onClick={() => void postNow(tx)}>Post Now</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>Transactions ({filtered.length})</h3>
          <input placeholder="Search category, merchant, notes..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Category</th><th>Merchant</th><th>Amount</th><th>Account</th><th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx.id} className={tx.type === "income" ? "row-income" : "row-expense"}>
                  <td>{tx.date}</td>
                  <td className={tx.type === "income" ? "value-positive" : "value-negative"}>{tx.type}</td>
                  <td>{tx.category}</td>
                  <td>{tx.merchant || "-"}</td>
                  <td className={tx.type === "income" ? "value-positive" : "value-negative"}>{money(tx.amount)}</td>
                  <td>{bankNameById[tx.account] ?? cardNameById[tx.account] ?? tx.account}</td>
                  <td><button className="danger-btn" onClick={() => void deleteTransaction(tx.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

