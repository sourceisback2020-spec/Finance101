import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { creditDebtProjectionSeries, localIsoDate, transactionDeltaByAccount } from "../../domain/calculations";
import type { CreditCard } from "../../domain/models";
import { useFinanceStore } from "../../state/store";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";
import { CustomActiveDot } from "../../ui/charts/CustomActiveDot";
import { EmptyState } from "../../ui/EmptyState";

const initialState: CreditCard = {
  id: "",
  name: "",
  balance: 0,
  limitAmount: 0,
  apr: 0,
  minPayment: 0,
  dueDate: new Date().toISOString().slice(0, 10)
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function CreditCardsView() {
  const cards = useFinanceStore((state) => state.cards);
  const transactions = useFinanceStore((state) => state.transactions);
  const upsertCard = useFinanceStore((state) => state.upsertCard);
  const deleteCard = useFinanceStore((state) => state.deleteCard);
  const [form, setForm] = useState<CreditCard>(initialState);
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();
  const isEditing = Boolean(form.id);
  const debtSeries = creditDebtProjectionSeries(cards, 24);
  const hasDebt = cards.some((card) => card.balance > 0);
  const today = localIsoDate();
  const postedByAccount = transactionDeltaByAccount(transactions, today, { includeImported: false });
  const pendingByAccount = transactions
    .filter((tx) => tx.date > today)
    .reduce<Map<string, number>>((map, tx) => {
      const delta = tx.type === "income" ? tx.amount : -tx.amount;
      map.set(tx.account, (map.get(tx.account) ?? 0) + delta);
      return map;
    }, new Map<string, number>());
  const liveDebtTotal = useMemo(
    () => cards.reduce((sum, card) => sum + (card.balance - (postedByAccount.get(card.id) ?? 0)), 0),
    [cards, postedByAccount]
  );
  const totalLimit = useMemo(() => cards.reduce((sum, card) => sum + card.limitAmount, 0), [cards]);
  const utilization = totalLimit > 0 ? (liveDebtTotal / totalLimit) * 100 : 0;
  const totalMinPayment = useMemo(() => cards.reduce((sum, card) => sum + card.minPayment, 0), [cards]);
  const debtByCard = useMemo(
    () =>
      cards.map((card) => ({
        name: card.name,
        liveDebt: card.balance - (postedByAccount.get(card.id) ?? 0),
        limit: card.limitAmount
      })),
    [cards, postedByAccount]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await upsertCard({ ...form, id: form.id || crypto.randomUUID() });
    setForm(initialState);
  }

  return (
    <section className="stack-lg">
      <header><h2>Credit Cards</h2><p className="muted">Monitor balances, utilization, and minimum payment obligations.</p></header>
      <div className="kpi-grid">
        <article className="kpi-card"><h3>Cards</h3><strong>{cards.length}</strong></article>
        <article className="kpi-card"><h3>Live Debt</h3><strong className="value-negative">{money(liveDebtTotal)}</strong></article>
        <article className="kpi-card"><h3>Total Limit</h3><strong className="value-neutral">{money(totalLimit)}</strong></article>
        <article className="kpi-card"><h3>Utilization</h3><strong className={utilization > 70 ? "value-negative" : utilization > 30 ? "value-warning" : "value-positive"}>{utilization.toFixed(1)}%</strong></article>
        <article className="kpi-card"><h3>Min Payments / Mo</h3><strong className="value-warning">{money(totalMinPayment)}</strong></article>
      </div>
      <article className="panel">
        <h3>{isEditing ? "Edit Credit Card" : "Add Credit Card"}</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Balance<input type="number" min="0" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} /></label>
          <label>Limit<input type="number" min="0" step="0.01" value={form.limitAmount} onChange={(e) => setForm({ ...form, limitAmount: Number(e.target.value) })} /></label>
          <label>APR %<input type="number" min="0" step="0.01" value={form.apr} onChange={(e) => setForm({ ...form, apr: Number(e.target.value) })} /></label>
          <label>Min Payment<input type="number" min="0" step="0.01" value={form.minPayment} onChange={(e) => setForm({ ...form, minPayment: Number(e.target.value) })} /></label>
          <label>Due Date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
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
        <h3>Debt by Card</h3>
        {debtByCard.length === 0 ? (
          <EmptyState description="Add cards to compare balances by account." />
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart layout="vertical" data={debtByCard} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
                <XAxis type="number" tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip colors={colors} />} />
                <Bar dataKey="limit" fill={`${colors.axisColor}22`} radius={[0, 6, 6, 0]} barSize={22} {...anim} />
                <Bar dataKey="liveDebt" fill="url(#grad-bar-debt)" radius={[0, 6, 6, 0]} barSize={22} {...anim} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>

      <article className="panel">
        <h3>Debt Trend Projection (Stock-Style)</h3>
        {hasDebt ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={debtSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
                <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
                <XAxis dataKey="month" tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value: number) => money(value)} tick={{ fill: colors.axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip colors={colors} />} cursor={{ stroke: colors.brushStroke, strokeDasharray: "4 4", strokeWidth: 1 }} />
                <ReferenceLine y={0} stroke={colors.axisColor} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area type={visuals.curveType} dataKey="debt" stroke={colors.debt} fill="url(#grad-debt)" strokeWidth={visuals.strokeWidth} filter={visuals.glowEnabled ? "url(#chart-glow)" : undefined} activeDot={<CustomActiveDot />} {...anim} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState description="Add a card balance above $0 to see debt trend projection." />
        )}
      </article>

      <article className="panel">
        <h3>Cards</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Starting Debt</th><th>Posted Activity</th><th>Pending Activity</th><th>Live Debt</th><th>Limit</th><th>APR</th><th>Min Payment</th><th>Due</th><th /></tr></thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="row-debit">
                  <td>{card.name}</td>
                  <td className="value-negative">{money(card.balance)}</td>
                  <td className={-(postedByAccount.get(card.id) ?? 0) < 0 ? "value-positive" : "value-negative"}>{money(-(postedByAccount.get(card.id) ?? 0))}</td>
                  <td className={-(pendingByAccount.get(card.id) ?? 0) < 0 ? "value-positive" : "value-warning"}>{money(-(pendingByAccount.get(card.id) ?? 0))}</td>
                  <td className="value-negative">{money(card.balance - (postedByAccount.get(card.id) ?? 0))}</td>
                  <td className="value-neutral">{money(card.limitAmount)}</td>
                  <td>{card.apr}%</td>
                  <td className="value-warning">{money(card.minPayment)}</td>
                  <td>{card.dueDate}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => setForm(card)}>Edit</button>
                      <button className="danger-btn" onClick={() => void deleteCard(card.id)}>Delete</button>
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

