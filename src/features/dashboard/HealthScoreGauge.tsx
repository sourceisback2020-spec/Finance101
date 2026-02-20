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
        <div style={{ width: 170, height: 110, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={fillColor} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={fillColor} stopOpacity={1} />
                </linearGradient>
              </defs>
              <Pie
                data={gaugeData}
                dataKey="value"
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius={52}
                outerRadius={80}
                cornerRadius={4}
                paddingAngle={0}
                stroke="none"
                {...anim}
              >
                <Cell fill="url(#gauge-fill)" />
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
            <strong style={{ fontSize: 32, color: fillColor, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontWeight: 800 }}>{healthScore.score}</strong>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>{healthScore.rating}</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {healthScore.breakdown.map((sub) => (
            <div key={sub.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "var(--muted)" }}>{sub.label}</span>
                <span style={{ color: subScoreColor(sub.rating, colors), fontWeight: 600, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: 11 }}>{Math.round(sub.value)}/100</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: colors.gridColor, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)" }}>
                <div style={{
                  width: `${Math.round(sub.value)}%`,
                  height: "100%",
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${subScoreColor(sub.rating, colors)}cc, ${subScoreColor(sub.rating, colors)})`,
                  transition: "width 600ms ease-out",
                  boxShadow: sub.value >= 100 ? `0 0 8px ${subScoreColor(sub.rating, colors)}60` : "none",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
