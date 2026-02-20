import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetWorthPoint } from "../../domain/models";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";
import { CustomActiveDot } from "../../ui/charts/CustomActiveDot";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  if (!year || !monthNumber) return month;
  return `${monthNumber}/${year.slice(-2)}`;
}

export function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();

  if (data.length === 0) {
    return (
      <article className="panel net-worth-panel">
        <div className="panel-head"><h3>Net Worth Timeline</h3></div>
        <div className="chart-empty">Add bank accounts and transactions to track net worth over time.</div>
      </article>
    );
  }

  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2] : null;
  const change30d = prev ? latest.net - prev.net : 0;
  const growthRate = data.length >= 2 && data[0].net !== 0
    ? ((latest.net - data[0].net) / Math.abs(data[0].net)) * 100
    : 0;

  return (
    <article className="panel net-worth-panel">
      <div className="panel-head">
        <h3>Net Worth Timeline</h3>
      </div>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <h3>Current Net Worth</h3>
          <strong className={latest.net >= 0 ? "value-positive" : "value-negative"}>{compactMoney(latest.net)}</strong>
        </div>
        <div className="kpi-card">
          <h3>Last Month Change</h3>
          <strong className={change30d >= 0 ? "value-positive" : "value-negative"}>
            {change30d >= 0 ? "+" : ""}{compactMoney(change30d)}
          </strong>
        </div>
        <div className="kpi-card">
          <h3>Total Growth</h3>
          <strong className={growthRate >= 0 ? "value-positive" : "value-negative"}>
            {growthRate >= 0 ? "+" : ""}{growthRate.toFixed(1)}%
          </strong>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} vertical={visuals.gridStyle === "both"} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              minTickGap={20}
              tick={{ fill: colors.axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => compactMoney(value)}
              tick={{ fill: colors.axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip colors={colors} formatLabel={(l) => formatMonthLabel(String(l))} />} cursor={{ stroke: colors.brushStroke, strokeDasharray: "4 4", strokeWidth: 1 }} />
            {data.some((d) => d.net < 0) && <ReferenceLine y={0} stroke={colors.axisColor} strokeDasharray="4 4" strokeOpacity={0.5} />}
            <Area
              type={visuals.curveType}
              dataKey="assets"
              stroke={colors.income}
              fill="url(#grad-income)"
              strokeWidth={visuals.strokeWidth}
              filter={visuals.glowEnabled ? "url(#chart-glow)" : undefined}
              activeDot={<CustomActiveDot />}
              {...anim}
            />
            <Area
              type={visuals.curveType}
              dataKey="liabilities"
              stroke={colors.negative}
              fill="url(#grad-negative)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              strokeOpacity={0.7}
              activeDot={<CustomActiveDot />}
              {...anim}
            />
            <Area
              type={visuals.curveType}
              dataKey="net"
              stroke={colors.positive}
              fill="url(#grad-positive)"
              strokeWidth={3}
              filter={visuals.glowEnabled ? "url(#chart-glow)" : undefined}
              activeDot={<CustomActiveDot />}
              {...anim}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
