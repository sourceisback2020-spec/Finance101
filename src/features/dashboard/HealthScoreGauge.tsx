import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { FinancialHealthScore } from "../../domain/models";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function ratingColor(rating: "excellent" | "good" | "fair" | "poor", colors: ReturnType<typeof useChartTheme>["colors"]) {
  if (rating === "excellent" || rating === "good") return colors.positive;
  if (rating === "fair") return "#ffcf6a";
  return colors.negative;
}

function subScoreColor(rating: "good" | "fair" | "poor", colors: ReturnType<typeof useChartTheme>["colors"]) {
  if (rating === "good") return colors.positive;
  if (rating === "fair") return "#ffcf6a";
  return colors.negative;
}

export function HealthScoreGauge({ healthScore }: { healthScore: FinancialHealthScore }) {
  const { colors } = useChartTheme();
  const anim = useChartAnimation();
  const gaugeData = [
    { value: healthScore.score },
    { value: 100 - healthScore.score },
  ];
  const fillColor = ratingColor(healthScore.rating, colors);

  return (
    <article className="panel health-gauge">
      <div className="panel-head"><h3>Financial Health Score</h3></div>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ width: 160, height: 100, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                dataKey="value"
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius={50}
                outerRadius={75}
                paddingAngle={0}
                stroke="none"
                {...anim}
              >
                <Cell fill={fillColor} />
                <Cell fill={colors.gridColor} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{
            position: "absolute",
            bottom: 6,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
          }}>
            <strong style={{ fontSize: 28, color: fillColor }}>{healthScore.score}</strong>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{healthScore.rating}</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {healthScore.breakdown.map((sub) => (
            <div key={sub.label} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "var(--muted)" }}>{sub.label}</span>
                <span style={{ color: subScoreColor(sub.rating, colors) }}>{Math.round(sub.value)}/100</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: colors.gridColor, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.round(sub.value)}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: subScoreColor(sub.rating, colors),
                  transition: "width 400ms ease",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
