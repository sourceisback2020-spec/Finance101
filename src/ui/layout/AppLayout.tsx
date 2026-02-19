import { BarChart3, CreditCard, DollarSign, Landmark, Menu, Palette, PiggyBank, Repeat, Sparkles, Target, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useAppearance } from "../theme/ThemeContext";

type AppView = "dashboard" | "transactions" | "subscriptions" | "cards" | "banks" | "budgets" | "goals" | "scenarios" | "retirement" | "customize";

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
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "goals", label: "Goals", icon: Target },
  { id: "scenarios", label: "What-If Scenarios", icon: Sparkles },
  { id: "retirement", label: "401k Tracker", icon: Landmark },
  { id: "customize", label: "Customize UI", icon: Palette }
] as const;

export function AppLayout({ view, onChangeView, onExportCsv, onExportBackup, onImportBackup, authEmail, onSignOut, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { appearance } = useAppearance();
  const layout = appearance.layout ?? "default";
  const viewLabel = useMemo(() => nav.find((item) => item.id === view)?.label ?? "Dashboard", [view]);

  const handleChangeView = (nextView: AppView) => {
    onChangeView(nextView);
    setSidebarOpen(false);
  };

  const isTopnav = layout === "topnav";
  const isRail = layout === "compact-rail";
  const isFocus = layout === "focus";

  const sidebarContent = (
    <>
      {!isRail && (
        <div className="sidebar-mobile-head">
          <h1>Local Finance Planner</h1>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            Close
          </button>
        </div>
      )}
      {!isTopnav && !isRail && <p className="sidebar-subtitle">A clean desktop hub for your money decisions.</p>}
      {!isTopnav && !isRail && authEmail ? <p className="sidebar-auth">{authEmail}</p> : null}
      <nav>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => handleChangeView(item.id)}
              title={isRail ? item.label : undefined}
            >
              <Icon size={isRail ? 20 : 16} />
              {!isRail && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      {!isTopnav && !isRail && (
        <>
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
        </>
      )}
    </>
  );

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      {isTopnav ? (
        <header className="sidebar topnav-bar">
          <strong className="topnav-title">Finance101</strong>
          {sidebarContent}
        </header>
      ) : (
        <aside className={`sidebar ${isFocus && !sidebarOpen ? "focus-hidden" : ""}`} aria-hidden={!sidebarOpen ? undefined : false}>
          {sidebarContent}
        </aside>
      )}
      {sidebarOpen && !isTopnav ? (
        <button className="sidebar-overlay visible" onClick={() => setSidebarOpen(false)} aria-label="Close menu overlay" />
      ) : null}
      <main className="content">
        <div className="mobile-topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen((open) => !open)} aria-label="Open menu">
            Menu
          </button>
          <strong>{viewLabel}</strong>
        </div>
        {isFocus && (
          <button className="focus-toggle-btn" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle navigation">
            <Menu size={18} />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}

