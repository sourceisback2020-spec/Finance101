import type { ChartColors } from "./chartTheme";

type GradientDef = { id: string; color: string };

export function ChartGradientDefs({ colors, opacity = 0.35 }: { colors: ChartColors; opacity?: number }) {
  const areaGradients: GradientDef[] = [
    { id: "grad-income", color: colors.income },
    { id: "grad-expense", color: colors.expense },
    { id: "grad-net", color: colors.net },
    { id: "grad-balance", color: colors.balance },
    { id: "grad-debt", color: colors.debt },
    { id: "grad-positive", color: colors.positive },
    { id: "grad-negative", color: colors.negative },
    { id: "grad-subscription", color: colors.subscription },
  ];

  const barGradients: GradientDef[] = [
    { id: "grad-bar-positive", color: colors.positive },
    { id: "grad-bar-negative", color: colors.negative },
    { id: "grad-bar-debt", color: colors.debt },
    { id: "grad-bar-subscription", color: colors.subscription },
    { id: "grad-bar-balance", color: colors.balance },
    { id: "grad-bar-income", color: colors.income },
    { id: "grad-bar-expense", color: colors.expense },
  ];

  return (
    <defs>
      {/* 3-stop vertical area gradients — vivid top → mid fade → transparent bottom */}
      {areaGradients.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={g.color} stopOpacity={Math.min(1, opacity * 1.15)} />
          <stop offset="40%" stopColor={g.color} stopOpacity={opacity * 0.45} />
          <stop offset="100%" stopColor={g.color} stopOpacity={0.01} />
        </linearGradient>
      ))}

      {/* Horizontal bar gradients with inner highlight for glossy 3D feel */}
      {barGradients.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={g.color} stopOpacity={0.62} />
          <stop offset="30%" stopColor={g.color} stopOpacity={1} />
          <stop offset="72%" stopColor={g.color} stopOpacity={0.92} />
          <stop offset="100%" stopColor={g.color} stopOpacity={0.75} />
        </linearGradient>
      ))}

      {/* Soft glow — default for all line/area strokes */}
      <filter id="chart-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Strong glow — futurist / neon theme */}
      <filter id="chart-glow-strong" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Drop shadow for active dots */}
      <filter id="dot-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.3" />
      </filter>
    </defs>
  );
}
