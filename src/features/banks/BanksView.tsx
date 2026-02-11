import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { bankBalanceSeries, localIsoDate, transactionDeltaByAccount } from "../../domain/calculations";
import type { BankAccount } from "../../domain/models";
import { useFinanceStore } from "../../state/store";

const initialState: BankAccount = {
  id: "",
  institution: "",
  nickname: "",
  type: "checking",
  currentBalance: 0,
  availableBalance: 0,
  apy: 0,
  lastUpdated: new Date().toISOString().slice(0, 10)
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function BanksView() {
  const banks = useFinanceStore((state) => state.banks);
  const transactions = useFinanceStore((state) => state.transactions);
  const upsertBank = useFinanceStore((state) => state.upsertBank);
  const upsertTransaction = useFinanceStore((state) => state.upsertTransaction);
  const deleteBank = useFinanceStore((state) => state.deleteBank);
  const [form, setForm] = useState<BankAccount>(initialState);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [editedBalance, setEditedBalance] = useState<number>(0);
  const [quickBankId, setQuickBankId] = useState("");
  const [quickAmount, setQuickAmount] = useState(0);
  const [quickMode, setQuickMode] = useState<"add" | "subtract">("add");
  const balanceSeries = bankBalanceSeries(banks);
  const hasTimeline = balanceSeries.length >= 2;
  const today = localIsoDate();
  const postedByAccount = useMemo(() => transactionDeltaByAccount(transactions, today), [transactions, today]);
  const pendingByAccount = useMemo(
    () =>
      transactions
        .filter((tx) => tx.date > today)
        .reduce<Map<string, number>>((map, tx) => {
          const delta = tx.type === "income" ? tx.amount : -tx.amount;
          map.set(tx.account, (map.get(tx.account) ?? 0) + delta);
          return map;
        }, new Map<string, number>()),
    [transactions, today]
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await upsertBank({ ...form, id: form.id || crypto.randomUUID() });
    setForm(initialState);
  }

  async function saveEditedBalance(bank: BankAccount) {
    await upsertBank({
      ...bank,
      currentBalance: editedBalance,
      availableBalance: editedBalance,
      lastUpdated: localIsoDate()
    });
    setEditingBankId(null);
  }

  useEffect(() => {
    if (banks.length === 0) {
      setQuickBankId("");
      return;
    }
    if (!banks.some((bank) => bank.id === quickBankId)) {
      setQuickBankId(banks[0].id);
    }
  }, [banks, quickBankId]);

  async function applyQuickAdjustment() {
    const bank = banks.find((item) => item.id === quickBankId);
    if (!bank) return;
    const normalizedAmount = Math.max(0, quickAmount);
    if (normalizedAmount <= 0) return;

    await upsertTransaction({
      id: crypto.randomUUID(),
      date: localIsoDate(),
      amount: normalizedAmount,
      type: quickMode === "add" ? "income" : "expense",
      category: "Bank Adjustment",
      merchant: "Bank Adjustment",
      account: bank.id,
      note: `${quickMode === "add" ? "Added to" : "Subtracted from"} ${bank.institution} - ${bank.nickname}`,
      recurring: 0
    });
    setQuickAmount(0);
  }

  const totalBankCash = banks.reduce((sum, account) => sum + account.currentBalance + (postedByAccount.get(account.id) ?? 0), 0);
  const totalPending = banks.reduce((sum, account) => sum + (pendingByAccount.get(account.id) ?? 0), 0);
  const largestLive = [...banks]
    .map((bank) => ({ ...bank, live: bank.currentBalance + (postedByAccount.get(bank.id) ?? 0) }))
    .sort((a, b) => b.live - a.live)[0];
  const quickBank = banks.find((bank) => bank.id === quickBankId);
  const quickDelta = quickMode === "add" ? Math.max(0, quickAmount) : -Math.max(0, quickAmount);
  const quickLiveBalance = (quickBank?.currentBalance ?? 0) + (quickBank ? (postedByAccount.get(quickBank.id) ?? 0) : 0);
  const quickProjectedBalance = quickLiveBalance + quickDelta;

  return (
    <section className="stack-lg">
      <header>
        <h2>Bank Accounts</h2>
        <p className="muted">Connect your manual bank balances and monitor liquidity across checking, savings, and cash.</p>
      </header>
      <div className="kpi-grid">
        <article className="kpi-card"><h3>Accounts</h3><strong>{banks.length}</strong></article>
        <article className="kpi-card"><h3>Live Cash</h3><strong className="value-positive">{money(totalBankCash)}</strong></article>
        <article className="kpi-card"><h3>Pending Activity</h3><strong className={totalPending >= 0 ? "value-positive" : "value-negative"}>{money(totalPending)}</strong></article>
        <article className="kpi-card"><h3>Largest Account</h3><strong>{largestLive ? `${largestLive.nickname}: ${money(largestLive.live)}` : "-"}</strong></article>
      </div>

      <article className="panel">
        <h3>Add Bank Account</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Institution<input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></label>
          <label>Nickname<input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
          <label>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as BankAccount["type"] })}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="brokerage">Brokerage</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label>Starting Balance<input type="number" step="0.01" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: Number(e.target.value) })} /></label>
          <label>Available Balance<input type="number" step="0.01" value={form.availableBalance} onChange={(e) => setForm({ ...form, availableBalance: Number(e.target.value) })} /></label>
          <label>APY %<input type="number" step="0.01" min="0" value={form.apy} onChange={(e) => setForm({ ...form, apy: Number(e.target.value) })} /></label>
          <label>Last Updated<input type="date" value={form.lastUpdated} onChange={(e) => setForm({ ...form, lastUpdated: e.target.value })} /></label>
          <div className="row-actions"><button type="submit">Save Account</button></div>
        </form>
      </article>

      <article className="panel">
        <h3>Liquidity Timeline</h3>
        {hasTimeline ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={balanceSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,171,230,0.28)" />
                <XAxis dataKey="date" tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9fb8e9", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0f1d43", border: "1px solid #2f61c0", borderRadius: 10 }} />
                <Line type="monotone" dataKey="total" stroke="#56c7ff" dot={false} strokeWidth={2.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="chart-empty">Need at least 2 different update dates to draw a liquidity timeline.</div>
        )}
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>Quick Balance Widget</h3>
          <strong className={quickDelta >= 0 ? "value-positive" : "value-warning"}>
            {quickDelta >= 0 ? "+" : "-"}{money(Math.abs(quickDelta))}
          </strong>
        </div>
        <p className="muted">Fast add/subtract adjustments for your selected bank account.</p>
        <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
          <label>
            Account
            <select value={quickBankId} onChange={(e) => setQuickBankId(e.target.value)} disabled={banks.length === 0}>
              {banks.length === 0 ? (
                <option value="">No bank accounts</option>
              ) : (
                banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.institution} - {bank.nickname}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Action
            <select value={quickMode} onChange={(e) => setQuickMode(e.target.value as "add" | "subtract")}>
              <option value="add">Add</option>
              <option value="subtract">Subtract</option>
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={quickAmount}
              onChange={(e) => setQuickAmount(Number(e.target.value))}
            />
          </label>
          <div className="row-actions">
            <button type="button" onClick={() => void applyQuickAdjustment()} disabled={!quickBank || quickAmount <= 0}>
              Apply to Balance
            </button>
          </div>
        </form>
        <div className="kpi-grid">
          <article className="kpi-card">
            <h3>Live Balance</h3>
            <strong className={quickLiveBalance >= 0 ? "value-positive" : "value-negative"}>{money(quickLiveBalance)}</strong>
          </article>
          <article className="kpi-card">
            <h3>Adjustment</h3>
            <strong className={quickDelta >= 0 ? "value-positive" : "value-warning"}>
              {quickDelta >= 0 ? "+" : "-"}{money(Math.abs(quickDelta))}
            </strong>
          </article>
          <article className="kpi-card">
            <h3>Projected Live Balance</h3>
            <strong className={quickProjectedBalance >= 0 ? "value-positive" : "value-negative"}>
              {money(quickProjectedBalance)}
            </strong>
          </article>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h3>All Bank Accounts</h3>
          <strong>{money(totalBankCash)} total</strong>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Institution</th><th>Nickname</th><th>Type</th><th>Starting</th><th>Posted Activity</th><th>Pending Activity</th><th>Live Balance</th><th>APY</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {banks.map((bank) => (
                <tr key={bank.id} className="row-credit">
                  <td>{bank.institution}</td>
                  <td>{bank.nickname}</td>
                  <td>{bank.type}</td>
                  <td className="value-neutral">{money(bank.currentBalance)}</td>
                  <td className={(postedByAccount.get(bank.id) ?? 0) >= 0 ? "value-positive" : "value-negative"}>{money(postedByAccount.get(bank.id) ?? 0)}</td>
                  <td className={(pendingByAccount.get(bank.id) ?? 0) >= 0 ? "value-positive" : "value-warning"}>{money(pendingByAccount.get(bank.id) ?? 0)}</td>
                  <td className="value-positive">{money(bank.currentBalance + (postedByAccount.get(bank.id) ?? 0))}</td>
                  <td>{bank.apy}%</td>
                  <td>{bank.lastUpdated}</td>
                  <td>
                    {editingBankId === bank.id ? (
                      <div className="row-actions">
                        <input type="number" step="0.01" value={editedBalance} onChange={(e) => setEditedBalance(Number(e.target.value))} />
                        <button onClick={() => void saveEditedBalance(bank)}>Save</button>
                        <button onClick={() => setEditingBankId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button
                          onClick={() => {
                            setEditingBankId(bank.id);
                            setEditedBalance(bank.currentBalance);
                          }}
                        >
                          Edit Balance
                        </button>
                        <button className="danger-btn" onClick={() => void deleteBank(bank.id)}>Delete</button>
                      </div>
                    )}
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

