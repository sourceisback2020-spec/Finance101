import type { ChartColors } from "./chartTheme";

type GradientDef = { id: string; color: string };

export function ChartGradientDefs({ colors, opacity = 0.35 }: { colors: ChartColors; opacity?: number }) {
  const gradients: GradientDef[] = [
    { id: "grad-income", color: colors.income },
    { id: "grad-expense", color: colors.expense },
    { id: "grad-net", color: colors.net },
    { id: "grad-balance", color: colors.balance },
    { id: "grad-debt", color: colors.debt },
    { id: "grad-positive", color: colors.positive },
    { id: "grad-negative", color: colors.negative },
    { id: "grad-subscription", color: colors.subscription },
  ];

  return (
    <defs>
      {gradients.map((g) => (
        <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={g.color} stopOpacity={opacity} />
          <stop offset="95%" stopColor={g.color} stopOpacity={0.02} />
        </linearGradient>
      ))}
      <linearGradient id="grad-bar-positive" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={colors.positive} stopOpacity={0.7} />
        <stop offset="100%" stopColor={colors.positive} stopOpacity={1} />
      </linearGradient>
      <linearGradient id="grad-bar-negative" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={colors.negative} stopOpacity={0.7} />
        <stop offset="100%" stopColor={colors.negative} stopOpacity={1} />
      </linearGradient>
      <linearGradient id="grad-bar-debt" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={colors.debt} stopOpacity={0.65} />
        <stop offset="100%" stopColor={colors.debt} stopOpacity={1} />
      </linearGradient>
      <linearGradient id="grad-bar-subscription" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={colors.subscription} stopOpacity={0.65} />
        <stop offset="100%" stopColor={colors.subscription} stopOpacity={1} />
      </linearGradient>
      <linearGradient id="grad-bar-balance" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={colors.balance} stopOpacity={0.65} />
        <stop offset="100%" stopColor={colors.balance} stopOpacity={1} />
      </linearGradient>
      <filter id="chart-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
