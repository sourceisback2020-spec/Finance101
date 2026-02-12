import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { localIsoDate } from "../../domain/calculations";
import { useFinanceStore, useDashboardData } from "../../state/store";

type ChartRange = "3M" | "6M" | "1Y" | "ALL";
const piePalette = ["#5fd39a", "#6ea8fe", "#ffb26b", "#ff7c7c", "#b892ff", "#7fe7ff", "#ffd86a", "#5ff0cf"];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function rangeStart(range: ChartRange, todayIso: string) {
  if (range === "ALL") return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const monthsBack = range === "3M" ? 3 : range === "6M" ? 6 : 12;
  return new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
}

export function DashboardView() {
  const metrics = useFinanceStore((state) => state.metrics);
  const subscriptions = useFinanceStore((state) => state.subscriptions);
  const banks = useFinanceStore((state) => state.banks);
  const { categorySpend, cashflow, scenarioOutcomes } = useDashboardData();
  const [chartRange, setChartRange] = useState<ChartRange>("6M");
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showNet, setShowNet] = useState(true);
  const [areaMode, setAreaMode] = useState(false);
  const today = localIsoDate();
  const start = rangeStart(chartRange, today);
  const chartData = useMemo(
    () => (start ? cashflow.filter((point) => new Date(`${point.month}-01T00:00:00`) >= start) : cashflow),
    [cashflow, start]
  );
  const upcomingRenewals = [...subscriptions].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)).slice(0, 4);
  const largestBank = [...banks].sort((a, b) => b.currentBalance - a.currentBalance)[0];

  return (
    <section className="stack-lg">
      <header>
        <h2>Financial Command Center</h2>
        <p className="muted">Track cashflow, recurring costs, debt pressure, and retirement momentum in one place.</p>
      </header>

      <div className="kpi-grid">
        <article className="kpi-card"><h3>Posted Income</h3><strong className="value-positive">{money(metrics.income)}</strong></article>
        <article className="kpi-card"><h3>Posted Expenses</h3><strong className="value-negative">{money(metrics.expenses)}</strong></article>
        <article className="kpi-card"><h3>Net Cashflow</h3><strong className={metrics.netCashflow >= 0 ? "value-positive" : "value-negative"}>{money(metrics.netCashflow)}</strong></article>
        <article className="kpi-card"><h3>Subscriptions / Mo</h3><strong className="value-warning">{money(metrics.monthlySubscriptions)}</strong></article>
        <article className="kpi-card"><h3>Credit Card Debt</h3><strong className="value-negative">{money(metrics.totalCreditBalance)}</strong></article>
        <article className="kpi-card"><h3>Bank Cash Position</h3><strong className="value-positive">{money(metrics.bankCashPosition)}</strong></article>
        <article className="kpi-card"><h3>Utilization</h3><strong className={metrics.averageUtilizationPct > 70 ? "value-negative" : metrics.averageUtilizationPct > 30 ? "value-warning" : "value-positive"}>{metrics.averageUtilizationPct.toFixed(1)}%</strong></article>
        <article className="kpi-card"><h3>401k Balance</h3><strong className="value-positive">{money(metrics.retirementBalance)}</strong></article>
        <article className="kpi-card"><h3>401k in 12 Months</h3><strong className="value-positive">{money(metrics.retirementProjected12m)}</strong></article>
      </div>

      <div className="chart-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <h3>Cashflow Trend</h3>
            <div className="chart-toolbar">
              <div className="toggle-group">
                {(["3M", "6M", "1Y", "ALL"] as ChartRange[]).map((range) => (
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
                <button className={`chip-btn ${areaMode ? "active-chip" : ""}`} onClick={() => setAreaMode((v) => !v)}>Area</button>
              </div>
            </div>
          </div>
          {chartData.length < 2 ? (
            <div className="chart-empty">Add transactions across multiple months to view trend lines.</div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={200}>
                {areaMode ? (
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                    <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: number) => money(value)} contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                    <Legend />
                    {showIncome && <Area type="monotone" dataKey="income" stroke="#5fd39a" fill="rgba(95,211,154,0.2)" isAnimationActive={false} />}
                    {showExpense && <Area type="monotone" dataKey="expense" stroke="#ff7c7c" fill="rgba(255,124,124,0.2)" isAnimationActive={false} />}
                    {showNet && <Area type="monotone" dataKey="net" stroke="#6ea8fe" fill="rgba(110,168,254,0.18)" isAnimationActive={false} />}
                  </AreaChart>
                ) : (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                    <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: number) => money(value)} contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                    <Legend />
                    {showIncome && <Line type="monotone" dataKey="income" stroke="#5fd39a" dot={false} isAnimationActive={false} />}
                    {showExpense && <Line type="monotone" dataKey="expense" stroke="#ff7c7c" dot={false} isAnimationActive={false} />}
                    {showNet && <Line type="monotone" dataKey="net" stroke="#6ea8fe" dot={false} isAnimationActive={false} />}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel chart-panel">
          <h3>Spend by Category</h3>
          {categorySpend.length === 0 ? (
            <div className="chart-empty">No expense categories yet. Add expense transactions to populate this chart.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={categorySpend}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="rgba(5,10,26,0.85)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {categorySpend.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={piePalette[index % piePalette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => money(value)}
                  contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: "#9fb8e9", paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </article>
      </div>

      <div className="chart-grid">
        <article className="panel">
          <h3>Bank Liquidity</h3>
          {largestBank ? (
            <ul className="list">
              <li>
                <span>Top cash account</span>
                <span>{largestBank.institution} - {largestBank.nickname}</span>
                <strong>{money(largestBank.currentBalance)}</strong>
              </li>
              <li>
                <span>Total available cash</span>
                <span>Across all linked bank accounts</span>
                <strong>{money(banks.reduce((sum, bank) => sum + bank.availableBalance, 0))}</strong>
              </li>
            </ul>
          ) : (
            <p className="muted">Add bank accounts to view liquidity insights.</p>
          )}
        </article>

        <article className="panel">
          <h3>Upcoming Subscription Renewals</h3>
          {upcomingRenewals.length === 0 ? (
            <p className="muted">No renewals yet.</p>
          ) : (
            <ul className="list">
              {upcomingRenewals.map((sub) => (
                <li key={sub.id}>
                  <span>{sub.name}</span>
                  <span>{sub.nextDueDate}</span>
                  <strong>{money(sub.cost)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <h3>What-If Insights</h3>
          {scenarioOutcomes.length === 0 ? (
            <p className="muted">Create a scenario to compare spending choices.</p>
          ) : (
            <ul className="list">
              {scenarioOutcomes.slice(0, 4).map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <span>Monthly impact {money(item.monthlyScenarioCost)}</span>
                  <strong>Disposable {money(item.projectedDisposableAfterPurchase)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}

