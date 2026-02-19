import type { SpendingInsight } from "../../domain/models";

function severityStyle(severity: SpendingInsight["severity"]) {
  switch (severity) {
    case "warning":
      return { borderColor: "#ffcf6a", background: "rgba(255,207,106,0.08)" };
    case "success":
      return { borderColor: "var(--positive)", background: "rgba(0,200,120,0.08)" };
    default:
      return { borderColor: "var(--accent)", background: "rgba(100,160,255,0.08)" };
  }
}

function severityIcon(severity: SpendingInsight["severity"]) {
  switch (severity) {
    case "warning":
      return "\u26a0\ufe0f";
    case "success":
      return "\u2705";
    default:
      return "\u2139\ufe0f";
  }
}

export function InsightCards({ insights }: { insights: SpendingInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <article className="panel">
      <div className="panel-head"><h3>Insights</h3></div>
      <div style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        paddingBottom: 8,
        scrollSnapType: "x mandatory",
      }}>
        {insights.slice(0, 8).map((insight, idx) => {
          const style = severityStyle(insight.severity);
          return (
            <div
              key={`${insight.type}-${insight.category ?? ""}-${idx}`}
              style={{
                minWidth: 220,
                maxWidth: 280,
                padding: "12px 16px",
                borderRadius: 8,
                border: `1px solid ${style.borderColor}`,
                background: style.background,
                scrollSnapAlign: "start",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {severityIcon(insight.severity)} {insight.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                {insight.description}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
