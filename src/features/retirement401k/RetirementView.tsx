import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { calculateRetirementProjection, retirementTrendSeries } from "../../domain/calculations";
import type { RetirementEntry } from "../../domain/models";
import { useFinanceStore } from "../../state/store";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";
import { CustomActiveDot } from "../../ui/charts/CustomActiveDot";

const initialState: RetirementEntry = {
  id: "",
  date: new Date().toISOString().slice(0, 10),
  employeeContribution: 0,
  employerMatch: 0,
  balance: 0,
  annualReturn: 7
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function RetirementView() {
  const entries = useFinanceStore((state) => state.retirementEntries);
  const upsertEntry = useFinanceStore((state) => state.upsertRetirementEntry);
  const deleteEntry = useFinanceStore((state) => state.deleteRetirementEntry);
  const [form, setForm] = useState<RetirementEntry>(initialState);
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();
  const isEditing = Boolean(form.id);
  const projection = calculateRetirementProjection(entries);
  const trendSeries = retirementTrendSeries(entries);
  const hasTrend = trendSeries.length >= 2;
  const latest = entries[0];
  const monthlyContrib = useMemo(
    () => (latest ? latest.employeeContribution + latest.employerMatch : 0),
    [latest]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await upsertEntry({ ...form, id: form.id || crypto.randomUUID() });
    setForm(initialState);
  }

  return (
    <section className="stack-lg">
      <header><h2>401k Tracker</h2><p className="muted">Log contributions, employer match, and projected growth.</p></header>
      <div className="kpi-grid">
        <article className="kpi-card"><h3>Current Balance</h3><strong className="value-positive">{money(latest?.balance ?? 0)}</strong></article>
        <article className="kpi-card"><h3>12M Projection</h3><strong className="value-positive">{money(projection)}</strong></article>
        <article className="kpi-card"><h3>Monthly Contributions</h3><strong className="value-positive">{money(monthlyContrib)}</strong></article>
        <article className="kpi-card"><h3>Snapshots</h3><strong>{entries.length}</strong></article>
      </div>
      <article className="panel">
        <h3>{isEditing ? "Edit Snapshot" : "Add Snapshot"}</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Employee Contribution / Mo<input type="number" min="0" step="0.01" value={form.employeeContribution} onChange={(e) => setForm({ ...form, employeeContribution: Number(e.target.value) })} /></label>
          <label>Employer Match / Mo<input type="number" min="0" step="0.01" value={form.employerMatch} onChange={(e) => setForm({ ...form, employerMatch: Number(e.target.value) })} /></label>
          <label>Current Balance<input type="number" min="0" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} /></label>
          <label>Expected Annual Return %<input type="number" min="0" step="0.1" value={form.annualReturn} onChange={(e) => setForm({ ...form, annualReturn: Number(e.target.value) })} /></label>
          <div className="row-actions">
            <button type="submit">{isEditing ? "Update Snapshot" : "Save Snapshot"}</button>
            {isEditing ? (
              <button type="button" onClick={() => setForm(initialState)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="panel">
        <h3>Projection</h3>
        <p className="projection-text">Estimated 12-month balance: <strong>{money(projection)}</strong></p>
      </article>

      <article className="panel">
        <h3>Balance Trend</h3>
        {hasTrend ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
                <XAxis dataKey="date" tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Area type={visuals.curveType} dataKey="balance" stroke={colors.positive} fill="url(#grad-positive)" strokeWidth={2.5} activeDot={<CustomActiveDot />} {...anim} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="chart-empty">Add at least 2 retirement snapshots to see a historical trend.</div>
        )}
      </article>

      <article className="panel">
        <h3>History</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Employee</th><th>Match</th><th>Balance</th><th>Return</th><th /></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="row-credit">
                  <td>{entry.date}</td>
                  <td className="value-positive">{money(entry.employeeContribution)}</td>
                  <td className="value-positive">{money(entry.employerMatch)}</td>
                  <td className="value-positive">{money(entry.balance)}</td>
                  <td>{entry.annualReturn}%</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => setForm(entry)}>Edit</button>
                      <button className="danger-btn" onClick={() => void deleteEntry(entry.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

