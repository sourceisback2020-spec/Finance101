import type { SpendingInsight } from "../../domain/models";

function severityStyle(severity: SpendingInsight["severity"]) {
  switch (severity) {
    case "warning":
      return { borderColor: "#ffcf6a", background: "linear-gradient(135deg, rgba(255,207,106,0.12), rgba(255,207,106,0.04))" };
    case "success":
      return { borderColor: "var(--positive)", background: "linear-gradient(135deg, rgba(0,200,120,0.12), rgba(0,200,120,0.04))" };
    default:
      return { borderColor: "var(--accent)", background: "linear-gradient(135deg, rgba(100,160,255,0.12), rgba(100,160,255,0.04))" };
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
              className="insight-card"
              style={{
                minWidth: 220,
                maxWidth: 280,
                padding: "12px 16px",
                borderRadius: 10,
                border: `1px solid ${style.borderColor}`,
                background: style.background,
                scrollSnapAlign: "start",
                flexShrink: 0,
                transition: "transform 200ms ease, box-shadow 200ms ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 4px 12px ${style.borderColor}20`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {severityIcon(insight.severity)} {insight.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                {insight.description}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
