import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { calculateGoalProgress, debtPayoffTimeline, localIsoDate } from "../../domain/calculations";
import type { Goal, GoalType } from "../../domain/models";
import { useFinanceStore } from "../../state/store";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";

const initialState: Goal = {
  id: "",
  name: "",
  type: "savings",
  targetAmount: 0,
  currentAmount: 0,
  deadline: (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return localIsoDate(d);
  })(),
  linkedAccountId: "",
  note: "",
  isActive: 1
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function moneyShort(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function progressColor(pct: number, colors: ReturnType<typeof useChartTheme>["colors"]) {
  if (pct >= 100) return colors.positive;
  if (pct >= 50) return "#ffcf6a";
  return colors.negative;
}

export function GoalsView() {
  const goals = useFinanceStore((state) => state.goals);
  const banks = useFinanceStore((state) => state.banks);
  const cards = useFinanceStore((state) => state.cards);
  const upsertGoal = useFinanceStore((state) => state.upsertGoal);
  const deleteGoal = useFinanceStore((state) => state.deleteGoal);
  const [form, setForm] = useState<Goal>(initialState);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const isEditing = Boolean(form.id);
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();

  const progress = useMemo(
    () => calculateGoalProgress(goals, banks, cards),
    [goals, banks, cards]
  );

  const debtTimeline = useMemo(() => debtPayoffTimeline(cards, 36), [cards]);

  // Accounts for linking
  const accountOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = [{ id: "", label: "None" }];
    banks.forEach((b) => opts.push({ id: b.id, label: `${b.institution} - ${b.nickname}` }));
    cards.forEach((c) => opts.push({ id: c.id, label: `${c.name} (Credit Card)` }));
    return opts;
  }, [banks, cards]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...form, id: form.id || crypto.randomUUID() };
    await upsertGoal(payload);
    setForm(initialState);
    setStatus(isEditing ? "Goal updated." : "Goal created.");
    setTimeout(() => setStatus(null), 2000);
  }

  function onEdit(goal: Goal) {
    setForm(goal);
    setStatus(null);
  }

  async function onDelete(id: string) {
    await deleteGoal(id);
    setForm(initialState);
    setSelectedGoalId(null);
    setStatus("Goal deleted.");
    setTimeout(() => setStatus(null), 2000);
  }

  function onCancel() {
    setForm(initialState);
    setStatus(null);
  }

  const selectedProgress = progress.find((p) => p.goal.id === selectedGoalId);

  return (
    <section className="stack-lg">
      <header>
        <h2>Goals</h2>
        <p className="muted">Set financial goals, track progress, and plan debt payoff.</p>
      </header>

      {/* Goal form */}
      <article className="panel">
        <div className="panel-head"><h3>{isEditing ? "Edit Goal" : "New Goal"}</h3></div>
        <form className="form" onSubmit={(e) => void onSubmit(e)}>
          <div className="form-grid">
            <label>
              Goal Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Emergency Fund"
                required
              />
            </label>
            <label>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GoalType })}>
                <option value="savings">Savings</option>
                <option value="debt-payoff">Debt Payoff</option>
                <option value="investment">Investment</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Target Amount
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.targetAmount || ""}
                onChange={(e) => setForm({ ...form, targetAmount: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              Current Amount
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.currentAmount || ""}
                onChange={(e) => setForm({ ...form, currentAmount: Number(e.target.value) })}
              />
            </label>
            <label>
              Deadline
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
            </label>
            <label>
              Linked Account
              <select value={form.linkedAccountId} onChange={(e) => setForm({ ...form, linkedAccountId: e.target.value })}>
                {accountOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Notes
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="Optional notes..."
              />
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

      {/* Goal progress cards */}
      {progress.length > 0 && (
        <article className="panel">
          <div className="panel-head"><h3>Goal Progress</h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {progress.map((p) => {
              const fillColor = progressColor(p.pctComplete, colors);
              return (
                <div
                  key={p.goal.id}
                  style={{
                    padding: "16px",
                    borderRadius: 8,
                    border: `1px solid ${selectedGoalId === p.goal.id ? colors.income : colors.gridColor}`,
                    background: selectedGoalId === p.goal.id ? "rgba(100,160,255,0.06)" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedGoalId(selectedGoalId === p.goal.id ? null : p.goal.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <strong>{p.goal.name}</strong>
                      <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8, textTransform: "capitalize" }}>
                        {p.goal.type.replace("-", " ")}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="chip-btn" onClick={(e) => { e.stopPropagation(); onEdit(p.goal); }}>Edit</button>
                      <button className="chip-btn" onClick={(e) => { e.stopPropagation(); void onDelete(p.goal.id); }}>Delete</button>
                    </div>
                  </div>

                  {/* Circular progress */}
                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                      <svg viewBox="0 0 36 36" width={64} height={64}>
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={colors.gridColor}
                          strokeWidth="3"
                        />
                        <path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={fillColor}
                          strokeWidth="3"
                          strokeDasharray={`${Math.min(100, p.pctComplete)}, 100`}
                          strokeLinecap="round"
                          style={{ transition: "stroke-dasharray 400ms ease" }}
                        />
                      </svg>
                      <div style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: fillColor,
                      }}>
                        {p.pctComplete.toFixed(0)}%
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                        {money(p.goal.currentAmount)} of {money(p.goal.targetAmount)}
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: p.onTrack ? "var(--positive)" : "#ffcf6a" }}>
                          {p.onTrack ? "On track" : "Behind schedule"}
                        </span>
                        {p.monthlyNeeded > 0 && (
                          <span style={{ color: "var(--muted)", marginLeft: 8 }}>
                            Need {money(p.monthlyNeeded)}/mo
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        Deadline: {p.goal.deadline}
                        {p.projectedDate && <span> | Projected: {p.projectedDate}</span>}
                      </div>
                      {p.goal.note && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
                          {p.goal.note}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      )}

      {/* Detail chart for selected goal */}
      {selectedProgress && selectedProgress.goal.type === "debt-payoff" && debtTimeline.length > 0 && (
        <article className="panel chart-panel">
          <div className="panel-head">
            <h3>Debt Payoff Timeline</h3>
            <span className="muted" style={{ fontSize: 12 }}>Projected debt reduction over time</span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={debtTimeline} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: colors.axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Months", position: "insideBottomRight", offset: -4, fill: colors.axisColor, fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v: number) => moneyShort(v)}
                  tick={{ fill: colors.axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Area
                  type="monotone"
                  dataKey="totalDebt"
                  name="Total Debt"
                  stroke={colors.expense}
                  fill="url(#grad-expense)"
                  strokeWidth={2}
                  {...anim}
                />
                <Line
                  type="monotone"
                  dataKey="interestPaid"
                  name="Cumulative Interest"
                  stroke="#ffcf6a"
                  strokeWidth={1.5}
                  dot={false}
                  {...anim}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      {selectedProgress && selectedProgress.goal.type === "savings" && (
        <article className="panel chart-panel">
          <div className="panel-head">
            <h3>Savings Projection</h3>
            <span className="muted" style={{ fontSize: 12 }}>Projected growth at current pace</span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={(() => {
                  const points = [];
                  const current = selectedProgress.goal.currentAmount;
                  const monthly = selectedProgress.monthlyNeeded;
                  for (let i = 0; i <= 24; i++) {
                    points.push({
                      month: i,
                      projected: current + monthly * i,
                      target: selectedProgress.goal.targetAmount,
                    });
                  }
                  return points;
                })()}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: colors.axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Months", position: "insideBottomRight", offset: -4, fill: colors.axisColor, fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v: number) => moneyShort(v)}
                  tick={{ fill: colors.axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected Savings"
                  stroke={colors.income}
                  strokeWidth={2}
                  dot={false}
                  {...anim}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="#ffcf6a"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  {...anim}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      {/* Inactive goals */}
      {goals.filter((g) => !g.isActive).length > 0 && (
        <article className="panel">
          <div className="panel-head"><h3>Inactive Goals</h3></div>
          <ul className="list">
            {goals.filter((g) => !g.isActive).map((g) => (
              <li key={g.id}>
                <span>{g.name}</span>
                <span>{money(g.targetAmount)} - {g.type}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="chip-btn" onClick={() => onEdit(g)}>Edit</button>
                  <button className="chip-btn" onClick={() => void onDelete(g.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
