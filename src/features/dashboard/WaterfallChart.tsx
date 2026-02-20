import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "../../ui/charts/chartTheme";
import { useChartAnimation } from "../../hooks/useChartAnimation";
import { CustomTooltip } from "../../ui/charts/ChartTooltip";
import { ChartGradientDefs } from "../../ui/charts/ChartGradients";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

type WaterfallEntry = {
  name: string;
  invisible: number;
  visible: number;
  isTotal: boolean;
};

type Props = {
  income: number;
  categorySpend: Array<{ name: string; amount: number }>;
  netCashflow: number;
};

export function WaterfallChart({ income, categorySpend, netCashflow }: Props) {
  const { colors, visuals } = useChartTheme();
  const anim = useChartAnimation();

  if (income === 0 && categorySpend.length === 0) {
    return (
      <article className="panel chart-panel">
        <div className="panel-head"><h3>Cashflow Waterfall</h3></div>
        <div className="chart-empty">Add income and expense transactions to view the waterfall breakdown.</div>
      </article>
    );
  }

  // Build waterfall data: Income bar starts at 0, expense bars cascade down, Net is final
  const data: WaterfallEntry[] = [];
  data.push({ name: "Income", invisible: 0, visible: income, isTotal: true });

  let running = income;
  const topCategories = categorySpend.slice(0, 6);
  topCategories.forEach((cat) => {
    running -= cat.amount;
    data.push({ name: cat.name, invisible: Math.max(0, running), visible: cat.amount, isTotal: false });
  });

  // If there are more categories, group them as "Other"
  if (categorySpend.length > 6) {
    const otherTotal = categorySpend.slice(6).reduce((s, c) => s + c.amount, 0);
    running -= otherTotal;
    data.push({ name: "Other", invisible: Math.max(0, running), visible: otherTotal, isTotal: false });
  }

  data.push({ name: "Net", invisible: 0, visible: Math.max(0, netCashflow), isTotal: true });

  return (
    <article className="panel chart-panel">
      <div className="panel-head"><h3>Cashflow Waterfall</h3></div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <ChartGradientDefs colors={colors} opacity={visuals.gradientOpacity} />
            <CartesianGrid strokeDasharray="3 3" stroke={colors.gridColor} />
            <XAxis
              dataKey="name"
              tick={{ fill: colors.axisColor, fontSize: 11, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => money(v)}
              tick={{ fill: colors.axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip colors={colors} formatValue={(v, _name, entry) => {
                const payload = entry?.payload as WaterfallEntry | undefined;
                return money(payload?.visible ?? v);
              }} />}
            />
            {/* Invisible spacer bar */}
            <Bar dataKey="invisible" stackId="waterfall" fill="transparent" isAnimationActive={false} />
            {/* Visible portion */}
            <Bar dataKey="visible" stackId="waterfall" radius={[6, 6, 0, 0]} {...anim}>
              {data.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={entry.isTotal
                    ? (entry.name === "Net" ? (netCashflow >= 0 ? colors.positive : colors.negative) : colors.income)
                    : colors.expense
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
