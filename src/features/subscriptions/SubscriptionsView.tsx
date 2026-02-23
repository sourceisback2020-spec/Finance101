import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { calculateMonthlySubscriptionCost, localIsoDate, subscriptionForecastSeries } from "../../domain/calculations";
import type { Subscription } from "../../domain/models";
import { syncScheduledChargesForSubscription, clearScheduledChargesForSubscription } from "../../services/subscriptions/scheduledCharges";
import { useFinanceStore } from "../../state/store";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";
import { CustomActiveDot } from "../../ui/charts/CustomActiveDot";
import { EmptyState } from "../../ui/EmptyState";
import { normalizeUploadImage } from "../../ui/images/imageTools";

const initialState: Subscription = {
  id: "",
  name: "",
  cost: 0,
  frequency: "monthly",
  nextDueDate: (() => {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    return localIsoDate(next);
  })(),
  category: "Software",
  accountId: "unassigned",
  imageDataUrl: "",
  isActive: 1
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function SubscriptionsView() {
  const subscriptions = useFinanceStore((state) => state.subscriptions);
  const banks = useFinanceStore((state) => state.banks);
  const cards = useFinanceStore((state) => state.cards);
  const upsertSubscription = useFinanceStore((state) => state.upsertSubscription);
  const deleteSubscription = useFinanceStore((state) => state.deleteSubscription);
  const refreshAll = useFinanceStore((state) => state.refreshAll);
  const [form, setForm] = useState<Subscription>(initialState);
  const [status, setStatus] = useState<string | null>(null);
  const isEditing = Boolean(form.id);
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();
  const forecastSeries = subscriptionForecastSeries(subscriptions, 12);
  const activeSubs = useMemo(() => subscriptions.filter((sub) => sub.isActive), [subscriptions]);
  const monthlyCost = useMemo(() => calculateMonthlySubscriptionCost(subscriptions), [subscriptions]);
  const spendBySubscription = useMemo(
    () =>
      [...activeSubs]
        .map((sub) => ({
          name: sub.name,
          monthlyEquivalent: sub.frequency === "monthly" ? sub.cost : sub.frequency === "quarterly" ? sub.cost / 3 : sub.cost / 12
        }))
        .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent),
    [activeSubs]
  );
  const yearlyCost = monthlyCost * 12;
  const nextRenewal = useMemo(
    () => [...activeSubs].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0]?.nextDueDate ?? "N/A",
    [activeSubs]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { ...form, id: form.id || crypto.randomUUID() };
    await upsertSubscription(payload);
    await syncScheduledChargesForSubscription(payload);
    await refreshAll();
    setForm(initialState);
    setStatus("Saved subscription and updated scheduled transactions.");
  }

  async function onDelete(subscription: Subscription) {
    await clearScheduledChargesForSubscription(subscription.id);
    await deleteSubscription(subscription.id);
    await refreshAll();
    setStatus(`Deleted ${subscription.name} and removed its scheduled charges.`);
  }

  async function onImagePicked(file: File | undefined) {
    if (!file) return;
    try {
      const imageDataUrl = await normalizeUploadImage(file);
      setForm((prev) => ({ ...prev, imageDataUrl }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not process image.";
      setStatus(message);
    }
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
        <h3>{isEditing ? "Edit Subscription" : "Add Subscription"}</h3>
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
          <label>Charge Account
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
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
          <label>
            Icon Image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                void onImagePicked(e.target.files?.[0]);
              }}
            />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => setForm({ ...form, isActive: e.target.checked ? 1 : 0 })} />
            Active
          </label>
          {form.imageDataUrl ? (
            <div className="image-upload-preview">
              <img src={form.imageDataUrl} alt="Subscription preview" />
              <button type="button" className="danger-btn" onClick={() => setForm((prev) => ({ ...prev, imageDataUrl: "" }))}>
                Remove Image
              </button>
            </div>
          ) : null}
          <div className="row-actions">
            <button type="submit">{isEditing ? "Update" : "Save"}</button>
            {isEditing ? (
              <button type="button" onClick={() => setForm(initialState)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="panel">
        <h3>Cost by Subscription (Monthly Equivalent)</h3>
        {spendBySubscription.length === 0 ? (
          <EmptyState description="No active subscriptions to visualize." />
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart layout="vertical" data={spendBySubscription} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
                <XAxis type="number" tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Bar dataKey="monthlyEquivalent" fill="url(#grad-bar-subscription)" radius={[0, 8, 8, 0]} barSize={18} {...anim}>
                  <LabelList dataKey="monthlyEquivalent" position="right" formatter={(v: number) => money(v)} style={{ fill: colors.axisColor, fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>

      <article className="panel">
        <h3>Recurring Cost Forecast (12 Months)</h3>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={forecastSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
              <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
              <XAxis dataKey="month" tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip colors={colors} />} />
              <Area type={visuals.curveType} dataKey="recurringCost" stroke={colors.subscription} fill="url(#grad-subscription)" strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />
              <Area type={visuals.curveType} dataKey="cumulative" stroke={colors.balance} fill="url(#grad-balance)" strokeWidth={2} activeDot={<CustomActiveDot />} {...anim} />
            </AreaChart>
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
                  <td>
                    <div className="entity-with-image">
                      {sub.imageDataUrl ? <img src={sub.imageDataUrl} alt={sub.name} className="entity-thumb" /> : <span className="entity-thumb entity-thumb-fallback">S</span>}
                      <span>{sub.name}</span>
                    </div>
                  </td>
                  <td className="value-warning">{money(sub.cost)}</td>
                  <td>{sub.frequency}</td>
                  <td>{sub.nextDueDate}</td>
                  <td>{sub.category}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => setForm(sub)}>Edit</button>
                      <button className="danger-btn" onClick={() => void onDelete(sub)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}

