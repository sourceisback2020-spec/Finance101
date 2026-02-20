import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryVariance } from "../../domain/models";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function SpendingPulseChart({ data }: { data: CategoryVariance[] }) {
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();

  if (data.length === 0) {
    return (
      <article className="panel spending-pulse">
        <div className="panel-head"><h3>Spending Pulse</h3></div>
        <div className="chart-empty">Need expense transactions in at least 2 months to show spending variance.</div>
      </article>
    );
  }

  const chartData = data.slice(0, 10).map((item) => ({
    category: item.category,
    change: item.change,
    changePct: item.changePct,
    anomaly: item.anomaly,
  }));

  return (
    <article className="panel spending-pulse">
      <div className="panel-head">
        <h3>Spending Pulse</h3>
        <span className="muted" style={{ fontSize: 12 }}>Month-over-month category variance</span>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32 + 40)}>
          <BarChart layout="vertical" data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
            <XAxis
              type="number"
              tickFormatter={(value: number) => money(value)}
              tick={{ fill: colors.axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={120}
              tick={{ fill: colors.axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip colors={colors} formatValue={(v, name) => {
                const item = chartData.find((d) => d.category === name);
                const pct = item?.changePct ?? 0;
                return `${money(v)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
              }} />}
            />
            <Bar dataKey="change" radius={[0, 6, 6, 0]} barSize={22} {...anim}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`${entry.category}-${index}`}
                  fill={entry.change > 0 ? "url(#grad-bar-negative)" : "url(#grad-bar-positive)"}
                  stroke={entry.anomaly ? "#ffcf6a" : "none"}
                  strokeWidth={entry.anomaly ? 2 : 0}
                  strokeDasharray={entry.anomaly ? "4 2" : undefined}
                />
              ))}
              <LabelList
                dataKey="changePct"
                position="right"
                formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
                style={{ fill: colors.axisColor, fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
