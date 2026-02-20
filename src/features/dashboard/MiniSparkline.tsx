import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useChartTheme } from "../../ui/charts/chartTheme";

type Props = {
  data: Array<{ value: number }>;
  width?: number;
  height?: number;
  color?: string;
};

/** Endpoint dot rendered on the last data point */
function EndpointDot(props: { cx?: number; cy?: number; index?: number; stroke?: string; dataLength: number }) {
  const { cx = 0, cy = 0, index = 0, stroke = "#fff", dataLength } = props;
  if (index !== dataLength - 1) return null;
  return <circle cx={cx} cy={cy} r={2.5} fill={stroke} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />;
}

export function MiniSparkline({ data, width = 80, height = 24, color }: Props) {
  const { colors } = useChartTheme();
  const strokeColor = color ?? colors.income;

  if (data.length < 2) return null;

  return (
    <div style={{ width, height, display: "inline-block" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            fill="url(#sparkline-fill)"
            strokeWidth={2}
            dot={(dotProps: { cx?: number; cy?: number; index?: number; stroke?: string }) => (
              <EndpointDot {...dotProps} dataLength={data.length} />
            )}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
