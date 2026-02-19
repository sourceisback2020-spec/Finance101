import type { BudgetStatus } from "../../domain/models";
import { useChartTheme } from "../../ui/charts/chartTheme";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function barColor(pctUsed: number, colors: ReturnType<typeof useChartTheme>["colors"]) {
  if (pctUsed >= 100) return colors.negative;
  if (pctUsed >= 75) return "#ffcf6a";
  return colors.positive;
}

export function BudgetSummaryPanel({ statuses }: { statuses: BudgetStatus[] }) {
  const { colors } = useChartTheme();

  if (statuses.length === 0) {
    return (
      <article className="panel">
        <div className="panel-head"><h3>Budget Overview</h3></div>
        <p className="muted">Create budgets to track category spending limits.</p>
      </article>
    );
  }

  const sorted = [...statuses].sort((a, b) => b.pctUsed - a.pctUsed);
  const display = sorted.slice(0, 4);

  return (
    <article className="panel">
      <div className="panel-head"><h3>Budget Overview</h3></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {display.map((status) => (
          <div key={status.budget.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{status.budget.category}</span>
              <span style={{ color: "var(--muted)" }}>
                {money(status.spent)} / {money(status.budget.amount)}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: colors.gridColor, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(100, status.pctUsed)}%`,
                  height: "100%",
                  borderRadius: 4,
                  background: barColor(status.pctUsed, colors),
                  transition: "width 400ms ease",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {status.pctUsed >= 100
                ? `Over by ${money(status.spent - status.budget.amount)}`
                : `${money(status.remaining)} remaining`}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
