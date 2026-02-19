import { Line, LineChart, ResponsiveContainer } from "recharts";
import { useChartTheme } from "../../ui/charts/chartTheme";

type Props = {
  data: Array<{ value: number }>;
  width?: number;
  height?: number;
  color?: string;
};

export function MiniSparkline({ data, width = 80, height = 24, color }: Props) {
  const { colors } = useChartTheme();
  const strokeColor = color ?? colors.income;

  if (data.length < 2) return null;

  return (
    <div style={{ width, height, display: "inline-block" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
