import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Cell,
  Label,
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
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";
import { CustomActiveDot } from "../../ui/charts/CustomActiveDot";
import { HealthScoreGauge } from "./HealthScoreGauge";
import { SpendingPulseChart } from "./SpendingPulseChart";
import { NetWorthChart } from "./NetWorthChart";

type ChartRange = "3M" | "6M" | "1Y" | "ALL";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function rangeStart(range: ChartRange, todayIso: string) {
  if (range === "ALL") return null;
  const today = new Date(`${todayIso}T00:00:00`);
  const monthsBack = range === "3M" ? 3 : range === "6M" ? 6 : 12;
  return new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  if (!year || !monthNumber) return month;
  return `${monthNumber}/${year.slice(-2)}`;
}

export function DashboardView() {
  const metrics = useFinanceStore((state) => state.metrics);
  const subscriptions = useFinanceStore((state) => state.subscriptions);
  const banks = useFinanceStore((state) => state.banks);
  const { categorySpend, cashflow, scenarioOutcomes, healthScore, spendingPulse, netWorth } = useDashboardData();
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();
  const [chartRange, setChartRange] = useState<ChartRange>("6M");
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showNet, setShowNet] = useState(true);
  const [areaMode, setAreaMode] = useState(false);
  const today = localIsoDate();
  const start = rangeStart(chartRange, today);
  const endMonth = today.slice(0, 7);
  const chartData = useMemo(
    () => (start ? cashflow.filter((point) => new Date(`${point.month}-01T00:00:00`) >= start && point.month <= endMonth) : cashflow),
    [cashflow, start, endMonth]
  );
  const upcomingRenewals = [...subscriptions].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)).slice(0, 4);
  const largestBank = [...banks].sort((a, b) => b.currentBalance - a.currentBalance)[0];

  return (
    <section className="stack-lg">
      <header>
        <h2>Financial Command Center</h2>
        <p className="muted">Track cashflow, recurring costs, debt pressure, and retirement momentum in one place.</p>
      </header>

      <HealthScoreGauge healthScore={healthScore} />

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

      <NetWorthChart data={netWorth} />

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
              <ResponsiveContainer width="100%" height={240}>
                {areaMode ? (
                  <AreaChart data={chartData}>
                    <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
                    <XAxis dataKey="month" tickFormatter={formatMonthLabel} minTickGap={20} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip colors={colors} formatLabel={(l) => formatMonthLabel(String(l))} />} />
                    <Legend />
                    {showIncome && <Area type={visuals.curveType} dataKey="income" stroke={colors.income} fill="url(#grad-income)" strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />}
                    {showExpense && <Area type={visuals.curveType} dataKey="expense" stroke={colors.expense} fill="url(#grad-expense)" strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />}
                    {showNet && <Area type={visuals.curveType} dataKey="net" stroke={colors.net} fill="url(#grad-net)" strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />}
                    {chartData.length > 18 ? <Brush dataKey="month" height={18} stroke={colors.brushStroke} travellerWidth={8} /> : null}
                  </AreaChart>
                ) : (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
                    <XAxis dataKey="month" tickFormatter={formatMonthLabel} minTickGap={20} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip colors={colors} formatLabel={(l) => formatMonthLabel(String(l))} />} />
                    <Legend />
                    {showIncome && <Line type={visuals.curveType} dataKey="income" stroke={colors.income} dot={false} strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />}
                    {showExpense && <Line type={visuals.curveType} dataKey="expense" stroke={colors.expense} dot={false} strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />}
                    {showNet && <Line type={visuals.curveType} dataKey="net" stroke={colors.net} dot={false} strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />}
                    {chartData.length > 18 ? <Brush dataKey="month" height={18} stroke={colors.brushStroke} travellerWidth={8} /> : null}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="panel chart-panel">
          <div className="panel-head"><h3>Spend by Category</h3></div>
          {categorySpend.length === 0 ? (
            <div className="chart-empty">No expense categories yet. Add expense transactions to populate this chart.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
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
                  label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                  labelLine={false}
                  {...anim}
                >
                  {categorySpend.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={colors.piePalette[index % colors.piePalette.length]} />
                  ))}
                  <Label
                    value={money(categorySpend.reduce((s, e) => s + e.amount, 0))}
                    position="center"
                    style={{ fontSize: 14, fontWeight: 700, fill: "#fff" }}
                  />
                </Pie>
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: colors.axisColor, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </article>
      </div>

      <SpendingPulseChart data={spendingPulse} />

      <div className="chart-grid">
        <article className="panel">
          <div className="panel-head"><h3>Bank Liquidity</h3></div>
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
          <div className="panel-head"><h3>Upcoming Subscription Renewals</h3></div>
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
          <div className="panel-head"><h3>What-If Insights</h3></div>
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
