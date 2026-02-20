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
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {display.map((status) => {
          const color = barColor(status.pctUsed, colors);
          const isOver = status.pctUsed >= 100;
          return (
            <div key={status.budget.id}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{status.budget.category}</span>
                <span style={{ color: "var(--muted)", fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: 11 }}>
                  {money(status.spent)} / {money(status.budget.amount)}
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: colors.gridColor, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                <div
                  style={{
                    width: `${Math.min(100, status.pctUsed)}%`,
                    height: "100%",
                    borderRadius: 5,
                    background: `linear-gradient(90deg, ${color}cc, ${color})`,
                    transition: "width 600ms ease-out",
                    boxShadow: isOver ? `0 0 10px ${color}50` : "none",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: isOver ? colors.negative : "var(--muted)", marginTop: 3, fontWeight: isOver ? 600 : 400 }}>
                {isOver
                  ? `Over by ${money(status.spent - status.budget.amount)}`
                  : `${money(status.remaining)} remaining`}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
