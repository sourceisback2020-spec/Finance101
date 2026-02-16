import type { CSSProperties } from "react";
import type { ChartColors } from "./chartTheme";

export function tooltipStyle(colors: ChartColors): CSSProperties {
  return {
    background: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: 10,
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
      background: colors.tooltipBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: 10,
      padding: "8px 12px",
      backdropFilter: "blur(8px)",
      boxShadow: `0 4px 20px ${colors.tooltipBg}80`,
      minWidth: 120,
    }}>
      {displayLabel && (
        <div style={{ fontSize: 11, color: colors.axisColor, marginBottom: 4, fontWeight: 600 }}>
          {displayLabel}
        </div>
      )}
      {payload.map((item, i) => (
        <div key={`${item.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: 1.6 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: item.color ?? colors.positive,
            flexShrink: 0,
          }} />
          <span style={{ color: colors.axisColor, textTransform: "capitalize" }}>
            {item.name ?? item.dataKey ?? ""}
          </span>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: "#fff", fontFamily: "var(--font-family-ui)" }}>
            {valueFn(item.value ?? 0, item.name ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}
