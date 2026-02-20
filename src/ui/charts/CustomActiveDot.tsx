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
      {/* Outer pulsing ring */}
      <circle
        cx={cx} cy={cy} r={14}
        fill={stroke} fillOpacity={0.06}
        stroke={stroke} strokeWidth={1} strokeOpacity={0.15}
        className="dot-pulse-ring"
      />
      {/* Mid halo */}
      <circle
        cx={cx} cy={cy} r={8}
        fill={stroke} fillOpacity={0.14}
        stroke="none"
      />
      {/* Inner solid dot with drop shadow */}
      <circle
        cx={cx} cy={cy} r={4.5}
        fill={stroke}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={1.5}
        filter="url(#dot-shadow)"
      />
      {/* Inner white highlight for depth */}
      <circle
        cx={cx} cy={cy - 1.2} r={1.5}
        fill="rgba(255,255,255,0.35)"
        stroke="none"
      />
    </g>
  );
}
