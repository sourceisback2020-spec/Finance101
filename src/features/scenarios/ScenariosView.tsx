import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { evaluateScenario, localIsoDate, scenarioSeries } from "../../domain/calculations";
import type { Scenario } from "../../domain/models";
import { useFinanceStore } from "../../state/store";

const initialState: Scenario = {
  id: "",
  name: "",
  purchaseAmount: 0,
  durationMonths: 12,
  paymentType: "card",
  createdAt: localIsoDate(),
  accountId: "unassigned",
  scheduleDate: localIsoDate(),
  isApplied: 1
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function ScenariosView() {
  const scenarios = useFinanceStore((state) => state.scenarios);
  const metrics = useFinanceStore((state) => state.metrics);
  const banks = useFinanceStore((state) => state.banks);
  const cards = useFinanceStore((state) => state.cards);
  const upsertScenario = useFinanceStore((state) => state.upsertScenario);
  const deleteScenario = useFinanceStore((state) => state.deleteScenario);
  const [form, setForm] = useState<Scenario>(initialState);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0];
  const selectedResult = selectedScenario
    ? evaluateScenario(selectedScenario, metrics.netCashflow, metrics.monthlySubscriptions, cards)
    : null;
  const scenarioChartSeries = useMemo(() => {
    if (!selectedScenario || !selectedResult) return [];
    return scenarioSeries(selectedScenario, selectedResult.baselineDisposable, selectedResult.projectedDebt - (selectedScenario.paymentType === "card" ? selectedScenario.purchaseAmount : 0));
  }, [selectedScenario, selectedResult]);
  const avgMonthlyImpact = useMemo(() => {
    if (scenarios.length === 0) return 0;
    const total = scenarios.reduce((sum, scenario) => sum + (scenario.durationMonths > 0 ? scenario.purchaseAmount / scenario.durationMonths : scenario.purchaseAmount), 0);
    return total / scenarios.length;
  }, [scenarios]);
  const worstDisposable = useMemo(() => {
    if (scenarios.length === 0) return metrics.netCashflow - metrics.monthlySubscriptions;
    return Math.min(
      ...scenarios.map((scenario) => evaluateScenario(scenario, metrics.netCashflow, metrics.monthlySubscriptions, cards).projectedDisposableAfterPurchase)
    );
  }, [scenarios, metrics.netCashflow, metrics.monthlySubscriptions, cards]);
  const maxProjectedDebt = useMemo(() => {
    if (scenarios.length === 0) return metrics.totalCreditBalance;
    return Math.max(
      ...scenarios.map((scenario) => evaluateScenario(scenario, metrics.netCashflow, metrics.monthlySubscriptions, cards).projectedDebt)
    );
  }, [scenarios, metrics.netCashflow, metrics.monthlySubscriptions, cards, metrics.totalCreditBalance]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await upsertScenario({ ...form, id: form.id || crypto.randomUUID() });
    setForm(initialState);
  }

  return (
    <section className="stack-lg">
      <header><h2>What-If Scenarios</h2><p className="muted">Preview the monthly and debt impact of future purchases.</p></header>
      <div className="kpi-grid">
        <article className="kpi-card"><h3>Scenarios</h3><strong>{scenarios.length}</strong></article>
        <article className="kpi-card"><h3>Avg Monthly Impact</h3><strong className="value-warning">{money(avgMonthlyImpact)}</strong></article>
        <article className="kpi-card"><h3>Worst Disposable</h3><strong className={worstDisposable >= 0 ? "value-positive" : "value-negative"}>{money(worstDisposable)}</strong></article>
        <article className="kpi-card"><h3>Max Projected Debt</h3><strong className="value-negative">{money(maxProjectedDebt)}</strong></article>
      </div>
      <article className="panel">
        <h3>Create Scenario</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Purchase Amount<input type="number" min="0" step="0.01" value={form.purchaseAmount} onChange={(e) => setForm({ ...form, purchaseAmount: Number(e.target.value) })} /></label>
          <label>Duration (months)<input type="number" min="1" value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })} /></label>
          <label>Payment Type
            <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value as Scenario["paymentType"] })}>
              <option value="card">Credit Card</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label>Impact Account
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
          <label>Schedule Start Date<input type="date" value={form.scheduleDate} onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })} /></label>
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(form.isApplied)} onChange={(e) => setForm({ ...form, isApplied: e.target.checked ? 1 : 0 })} />
            Apply scenario across app
          </label>
          <div className="row-actions"><button type="submit">Analyze</button></div>
        </form>
      </article>
      <article className="panel">
        <div className="panel-head">
          <h3>Scenario Timeline</h3>
          <select value={selectedScenario?.id ?? ""} onChange={(e) => setSelectedScenarioId(e.target.value)}>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </div>
        {scenarioChartSeries.length === 0 ? (
          <p className="muted">Create a scenario to view projected disposable cash and debt over time.</p>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scenarioChartSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                <XAxis dataKey="month" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                <Legend />
                <Line type="monotone" dataKey="disposable" stroke="#84f2c8" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="debt" stroke="#ff8a92" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>

      <article className="panel">
        <h3>Scenario Results</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Monthly Cost</th><th>Disposable After</th><th>Projected Debt</th><th>Schedule</th><th>Applied</th><th /></tr></thead>
            <tbody>
              {scenarios.map((scenario) => {
                const result = evaluateScenario(scenario, metrics.netCashflow, metrics.monthlySubscriptions, cards);
                return (
                  <tr key={scenario.id} className="row-debit">
                    <td>{scenario.name}</td>
                    <td className="value-warning">{money(result.monthlyScenarioCost)}</td>
                    <td className={result.projectedDisposableAfterPurchase >= 0 ? "value-positive" : "value-negative"}>{money(result.projectedDisposableAfterPurchase)}</td>
                    <td className="value-negative">{money(result.projectedDebt)}</td>
                    <td>{scenario.scheduleDate}</td>
                    <td>{scenario.isApplied ? "Yes" : "No"}</td>
                    <td><button className="danger-btn" onClick={() => void deleteScenario(scenario.id)}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

