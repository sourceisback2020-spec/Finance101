import { BarChart3, CreditCard, DollarSign, Landmark, Palette, PiggyBank, Repeat, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

type AppView = "dashboard" | "transactions" | "subscriptions" | "cards" | "banks" | "scenarios" | "retirement" | "customize";

type Props = {
  view: AppView;
  onChangeView: (view: AppView) => void;
  onExportCsv: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  authEmail?: string | null;
  onSignOut?: () => void;
  children: ReactNode;
};

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "transactions", label: "Transactions", icon: DollarSign },
  { id: "subscriptions", label: "Subscriptions", icon: Repeat },
  { id: "cards", label: "Credit Cards", icon: CreditCard },
  { id: "banks", label: "Bank Accounts", icon: PiggyBank },
  { id: "scenarios", label: "What-If Scenarios", icon: Sparkles },
  { id: "retirement", label: "401k Tracker", icon: Landmark },
  { id: "customize", label: "Customize UI", icon: Palette }
] as const;

export function AppLayout({ view, onChangeView, onExportCsv, onExportBackup, onImportBackup, authEmail, onSignOut, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const viewLabel = useMemo(() => nav.find((item) => item.id === view)?.label ?? "Dashboard", [view]);

  const handleChangeView = (nextView: AppView) => {
    onChangeView(nextView);
    setSidebarOpen(false);
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <aside className="sidebar" aria-hidden={!sidebarOpen ? undefined : false}>
        <div className="sidebar-mobile-head">
          <h1>Local Finance Planner</h1>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            Close
          </button>
        </div>
        <p className="sidebar-subtitle">A clean desktop hub for your money decisions.</p>
        {authEmail ? <p className="sidebar-auth">{authEmail}</p> : null}
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => handleChangeView(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="export-btn" onClick={onExportBackup}>
          Export Full Backup
        </button>
        <button className="secondary-btn" onClick={onImportBackup}>
          Import Full Backup
        </button>
        <button className="secondary-btn" onClick={onExportCsv}>
          Export Transactions CSV
        </button>
        {onSignOut ? (
          <button className="secondary-btn" onClick={onSignOut}>
            Sign Out
          </button>
        ) : null}
      </aside>
      <button className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} aria-label="Close menu overlay" />
      <main className="content">
        <div className="mobile-topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen((open) => !open)} aria-label="Open menu">
            Menu
          </button>
          <strong>{viewLabel}</strong>
        </div>
        {children}
      </main>
    </div>
  );
}

