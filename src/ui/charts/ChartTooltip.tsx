import type { CSSProperties } from "react";
import type { ChartColors } from "./chartTheme";

export function tooltipStyle(colors: ChartColors): CSSProperties {
  return {
    background: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: 12,
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

type PayloadItem = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
};

export function CustomTooltip({
  active,
  payload,
  label,
  colors,
  formatLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: PayloadItem[];
  label?: string | number;
  colors: ChartColors;
  formatLabel?: (label: string | number) => string;
  formatValue?: (value: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const displayLabel = formatLabel ? formatLabel(label ?? "") : String(label ?? "");
  const valueFn = formatValue ?? ((v: number) => money(v));

  return (
    <div className="custom-tooltip" style={{
      background: `${colors.tooltipBg}e6`,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: 12,
      padding: "10px 14px",
      backdropFilter: "blur(14px) saturate(180%)",
      WebkitBackdropFilter: "blur(14px) saturate(180%)",
      boxShadow: `0 4px 24px ${colors.tooltipBg}90, 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
      minWidth: 140,
    }}>
      {displayLabel && (
        <div style={{
          fontSize: 11,
          color: colors.axisColor,
          marginBottom: 6,
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}>
          {displayLabel}
        </div>
      )}
      {displayLabel && payload.length > 0 && (
        <div style={{
          height: 1,
          background: `linear-gradient(90deg, transparent, ${colors.tooltipBorder}, transparent)`,
          marginBottom: 6,
        }} />
      )}
      {payload.map((item, i) => (
        <div key={`${item.name}-${i}`} style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          lineHeight: 1.7,
        }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: item.color ?? colors.positive,
            border: "1.5px solid rgba(255,255,255,0.18)",
            flexShrink: 0,
          }} />
          <span style={{ color: colors.axisColor, textTransform: "capitalize", fontSize: 12 }}>
            {item.name ?? item.dataKey ?? ""}
          </span>
          <span style={{
            marginLeft: "auto",
            fontWeight: 700,
            color: "#fff",
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontSize: 13,
            letterSpacing: "-0.02em",
          }}>
            {valueFn(item.value ?? 0, item.name ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}
