import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { calculateMonthlySubscriptionCost, subscriptionForecastSeries } from "../../domain/calculations";
import type { Subscription } from "../../domain/models";
import { useFinanceStore } from "../../state/store";

const initialState: Subscription = {
  id: "",
  name: "",
  cost: 0,
  frequency: "monthly",
  nextDueDate: new Date().toISOString().slice(0, 10),
  category: "Software",
  isActive: 1
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function SubscriptionsView() {
  const subscriptions = useFinanceStore((state) => state.subscriptions);
  const upsertSubscription = useFinanceStore((state) => state.upsertSubscription);
  const deleteSubscription = useFinanceStore((state) => state.deleteSubscription);
  const [form, setForm] = useState<Subscription>(initialState);
  const forecastSeries = subscriptionForecastSeries(subscriptions, 12);
  const activeSubs = useMemo(() => subscriptions.filter((sub) => sub.isActive), [subscriptions]);
  const monthlyCost = useMemo(() => calculateMonthlySubscriptionCost(subscriptions), [subscriptions]);
  const yearlyCost = monthlyCost * 12;
  const nextRenewal = useMemo(
    () => [...activeSubs].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0]?.nextDueDate ?? "N/A",
    [activeSubs]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await upsertSubscription({ ...form, id: form.id || crypto.randomUUID() });
    setForm(initialState);
  }

  return (
    <section className="stack-lg">
      <header><h2>Subscriptions</h2><p className="muted">Track recurring bills and upcoming renewals.</p></header>
      <div className="kpi-grid">
        <article className="kpi-card"><h3>Active Subscriptions</h3><strong>{activeSubs.length}</strong></article>
        <article className="kpi-card"><h3>Monthly Recurring</h3><strong className="value-warning">{money(monthlyCost)}</strong></article>
        <article className="kpi-card"><h3>Yearly Recurring</h3><strong className="value-warning">{money(yearlyCost)}</strong></article>
        <article className="kpi-card"><h3>Next Renewal</h3><strong>{nextRenewal}</strong></article>
      </div>
      <article className="panel">
        <h3>Add Subscription</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Cost<input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></label>
          <label>Frequency
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Subscription["frequency"] })}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>Next Due<input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} /></label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => setForm({ ...form, isActive: e.target.checked ? 1 : 0 })} />
            Active
          </label>
          <div className="row-actions"><button type="submit">Save</button></div>
        </form>
      </article>

      <article className="panel">
        <h3>Recurring Cost Forecast (12 Months)</h3>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={forecastSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
              <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
              <Line type="monotone" dataKey="recurringCost" stroke="#8ed0ff" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="cumulative" stroke="#ffb26b" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="panel">
        <h3>Active Subscriptions</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Cost</th><th>Frequency</th><th>Next Due</th><th>Category</th><th /></tr></thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} className={sub.isActive ? "row-debit" : ""}>
                  <td>{sub.name}</td><td className="value-warning">{money(sub.cost)}</td><td>{sub.frequency}</td><td>{sub.nextDueDate}</td><td>{sub.category}</td>
                  <td><button className="danger-btn" onClick={() => void deleteSubscription(sub.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

