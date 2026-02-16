export function CustomActiveDot(props: {
  cx?: number;
  cy?: number;
  stroke?: string;
  fill?: string;
  r?: number;
  index?: number;
  value?: number;
}) {
  const { cx = 0, cy = 0, stroke = "#fff" } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={stroke} fillOpacity={0.12} stroke="none" />
      <circle cx={cx} cy={cy} r={5} fill={stroke} stroke="#000" strokeWidth={1.5} strokeOpacity={0.4} />
    </g>
  );
}
