import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyTrend } from "../../domain/models";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatMonthLabel(month: string) {
  const parts = month.split("-");
  if (parts.length < 2) return month;
  return `${parts[1]}/${parts[0].slice(-2)}`;
}

type Props = {
  trends: MonthlyTrend[];
  forecast: {
    nextMonthExpense: number;
    nextMonthIncome: number;
    confidence: "low" | "medium" | "high";
  };
};

function confidenceLabel(c: "low" | "medium" | "high") {
  if (c === "high") return { text: "High confidence", color: "var(--positive)" };
  if (c === "medium") return { text: "Medium confidence", color: "#ffcf6a" };
  return { text: "Low confidence", color: "var(--muted)" };
}

export function SpendingForecastPanel({ trends, forecast }: Props) {
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();
  const conf = confidenceLabel(forecast.confidence);

  if (trends.length < 2) {
    return (
      <article className="panel">
        <div className="panel-head"><h3>Spending Forecast</h3></div>
        <p className="muted">Need at least 2 months of data to forecast spending.</p>
      </article>
    );
  }

  const chartData = trends.map((t) => ({
    month: t.month,
    expense: t.expense,
    savings: t.savings,
  }));

  return (
    <article className="panel chart-panel">
      <div className="panel-head">
        <h3>Spending Forecast</h3>
        <span className="muted" style={{ fontSize: 12 }}>Next month projection</span>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Projected Expenses</div>
          <strong className="value-negative">{money(forecast.nextMonthExpense)}</strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Projected Income</div>
          <strong className="value-positive">{money(forecast.nextMonthIncome)}</strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Confidence</div>
          <strong style={{ color: conf.color }}>{conf.text}</strong>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              tick={{ fill: colors.axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => money(v)}
              tick={{ fill: colors.axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip colors={colors} formatLabel={(l) => formatMonthLabel(String(l))} />} />
            <Area
              type="monotone"
              dataKey="expense"
              stroke={colors.expense}
              fill="url(#grad-expense)"
              strokeWidth={2}
              {...anim}
            />
            <Area
              type="monotone"
              dataKey="savings"
              stroke={colors.income}
              fill="url(#grad-income)"
              strokeWidth={2}
              {...anim}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
