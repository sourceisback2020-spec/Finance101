import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { calculateBudgetStatuses, localIsoDate } from "../../domain/calculations";
import type { Budget, BudgetPeriod } from "../../domain/models";
import { useFinanceStore } from "../../state/store";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";

const initialState: Budget = {
  id: "",
  category: "",
  amount: 0,
  period: "monthly",
  startDate: localIsoDate(),
  isActive: 1
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function moneyShort(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function barColor(pctUsed: number, colors: ReturnType<typeof useChartTheme>["colors"]) {
  if (pctUsed >= 100) return colors.negative;
  if (pctUsed >= 75) return "#ffcf6a";
  return colors.positive;
}

export function BudgetsView() {
  const budgets = useFinanceStore((state) => state.budgets);
  const transactions = useFinanceStore((state) => state.transactions);
  const upsertBudget = useFinanceStore((state) => state.upsertBudget);
  const deleteBudget = useFinanceStore((state) => state.deleteBudget);
  const [form, setForm] = useState<Budget>(initialState);
  const [status, setStatus] = useState<string | null>(null);
  const isEditing = Boolean(form.id);
  const { colors } = useChartTheme();
  const anim = useChartAnimation();

  const today = localIsoDate();
  const statuses = useMemo(
    () => calculateBudgetStatuses(budgets, transactions, today),
    [budgets, transactions, today]
  );

  // Get unique categories from transactions for the dropdown
  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.type === "expense") values.add(tx.category);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  // Summary stats
  const totalBudgeted = budgets.filter((b) => b.isActive).reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = statuses.reduce((sum, s) => sum + s.spent, 0);
  const onTrackCount = statuses.filter((s) => s.onTrack).length;

  // Bar chart data: budget vs actual per category
  const barChartData = useMemo(
    () => statuses.map((s) => ({
      category: s.budget.category,
      budget: s.budget.amount,
      actual: s.spent,
    })),
    [statuses]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...form, id: form.id || crypto.randomUUID() };
    await upsertBudget(payload);
    setForm(initialState);
    setStatus(isEditing ? "Budget updated." : "Budget created.");
    setTimeout(() => setStatus(null), 2000);
  }

  function onEdit(budget: Budget) {
    setForm(budget);
    setStatus(null);
  }

  async function onDelete(id: string) {
    await deleteBudget(id);
    setForm(initialState);
    setStatus("Budget deleted.");
    setTimeout(() => setStatus(null), 2000);
  }

  function onCancel() {
    setForm(initialState);
    setStatus(null);
  }

  return (
    <section className="stack-lg">
      <header>
        <h2>Budgets</h2>
        <p className="muted">Set spending limits by category and track your progress.</p>
      </header>

      {/* Summary stats */}
      <div className="kpi-grid">
        <article className="kpi-card">
          <h3>Total Budgeted</h3>
          <strong className="value-positive">{money(totalBudgeted)}</strong>
        </article>
        <article className="kpi-card">
          <h3>Total Spent</h3>
          <strong className={totalSpent > totalBudgeted ? "value-negative" : "value-warning"}>{money(totalSpent)}</strong>
        </article>
        <article className="kpi-card">
          <h3>On Track</h3>
          <strong className={onTrackCount === statuses.length ? "value-positive" : "value-warning"}>
            {onTrackCount}/{statuses.length}
          </strong>
        </article>
      </div>

      {/* Budget form */}
      <article className="panel">
        <div className="panel-head"><h3>{isEditing ? "Edit Budget" : "New Budget"}</h3></div>
        <form className="form" onSubmit={(e) => void onSubmit(e)}>
          <div className="form-grid">
            <label>
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                <option value="">Select category...</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="__custom">Other (type below)</option>
              </select>
            </label>
            {form.category === "__custom" && (
              <label>
                Custom Category
                <input
                  type="text"
                  placeholder="e.g. Groceries"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                />
              </label>
            )}
            <label>
              Budget Amount
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.amount || ""}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              Period
              <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as BudgetPeriod })}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label>
              Start Date
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(form.isActive)}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked ? 1 : 0 })}
              />
              Active
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-btn">{isEditing ? "Update" : "Create"}</button>
            {isEditing && <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>}
          </div>
          {status && <p className="form-status">{status}</p>}
        </form>
      </article>

      {/* Budget status cards */}
      {statuses.length > 0 && (
        <article className="panel">
          <div className="panel-head"><h3>Budget Status</h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {statuses.map((s) => (
              <div key={s.budget.id} style={{
                padding: "12px 16px",
                borderRadius: 8,
                border: `1px solid ${s.pctUsed >= 100 ? colors.negative : colors.gridColor}`,
                background: s.pctUsed >= 100 ? "rgba(255,80,80,0.06)" : "transparent",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <strong>{s.budget.category}</strong>
                    <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{s.budget.period}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="chip-btn" onClick={() => onEdit(s.budget)}>Edit</button>
                    <button className="chip-btn" onClick={() => void onDelete(s.budget.id)}>Delete</button>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>{money(s.spent)} / {money(s.budget.amount)}</span>
                  <span style={{ color: s.onTrack ? "var(--positive)" : "#ffcf6a" }}>
                    {s.onTrack ? "On track" : "Over pace"}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: colors.gridColor, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(100, s.pctUsed)}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: barColor(s.pctUsed, colors),
                    transition: "width 400ms ease",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {s.pctUsed >= 100
                    ? `Over by ${money(s.spent - s.budget.amount)}`
                    : `${money(s.remaining)} remaining (${s.pctUsed.toFixed(0)}% used)`}
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* Inactive budgets list */}
      {budgets.filter((b) => !b.isActive).length > 0 && (
        <article className="panel">
          <div className="panel-head"><h3>Inactive Budgets</h3></div>
          <ul className="list">
            {budgets.filter((b) => !b.isActive).map((b) => (
              <li key={b.id}>
                <span>{b.category}</span>
                <span>{money(b.amount)} / {b.period}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="chip-btn" onClick={() => onEdit(b)}>Edit</button>
                  <button className="chip-btn" onClick={() => void onDelete(b.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}

      {/* Budget vs Actual chart */}
      {barChartData.length > 0 && (
        <article className="panel chart-panel">
          <div className="panel-head"><h3>Budget vs Actual</h3></div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={Math.max(200, barChartData.length * 40 + 60)}>
              <BarChart layout="vertical" data={barChartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => moneyShort(v)}
                  tick={{ fill: colors.axisColor, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={120}
                  tick={{ fill: colors.axisColor, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Legend />
                <Bar dataKey="budget" name="Budget" fill={colors.income} radius={[0, 4, 4, 0]} barSize={14} {...anim} />
                <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]} barSize={14} {...anim}>
                  {barChartData.map((entry, index) => (
                    <Cell
                      key={`actual-${index}`}
                      fill={entry.actual > entry.budget ? colors.negative : colors.expense}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}
    </section>
  );
}
