import { BarChart3, ChevronDown, ChevronUp, CreditCard, DollarSign, Landmark, Menu, Palette, PiggyBank, Repeat, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
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

type NavItem = { id: AppView; label: string; icon: typeof BarChart3 };

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "transactions", label: "Transactions", icon: DollarSign },
      { id: "subscriptions", label: "Subscriptions", icon: Repeat },
      { id: "cards", label: "Credit Cards", icon: CreditCard },
      { id: "banks", label: "Bank Accounts", icon: PiggyBank },
      { id: "budgets", label: "Budgets", icon: Wallet },
    ],
  },
  {
    label: "Plan",
    items: [
      { id: "goals", label: "Goals", icon: Target },
      { id: "scenarios", label: "What-If Scenarios", icon: Sparkles },
      { id: "retirement", label: "401k Tracker", icon: Landmark },
    ],
  },
];

const flatNav = navSections.flatMap((s) => s.items);

export function AppLayout({ view, onChangeView, onExportCsv, onExportBackup, onImportBackup, authEmail, onSignOut, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const { appearance } = useAppearance();
  const layout = appearance.layout ?? "default";
  const viewLabel = useMemo(() => [...flatNav, { id: "customize" as const, label: "Customize UI" }].find((item) => item.id === view)?.label ?? "Dashboard", [view]);

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
          <div className="sidebar-brand">
            <TrendingUp size={20} />
            <h1>Finance101</h1>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            Close
          </button>
        </div>
      )}
      {!isTopnav && !isRail && authEmail ? <p className="sidebar-auth">{authEmail}</p> : null}
      <nav>
        {isTopnav || isRail ? (
          /* Flat list for topnav/rail layouts */
          flatNav.map((item) => {
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
          })
        ) : (
          /* Grouped nav for sidebar layouts */
          navSections.map((section) => (
            <div key={section.label} className="nav-section">
              <span className="nav-section-label">{section.label}</span>
              {section.items.map((item) => {
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
            </div>
          ))
        )}
        {/* Customize always at the bottom */}
        {!isTopnav && !isRail && (
          <div className="nav-section nav-section-bottom">
            <button
              className={`nav-item ${view === "customize" ? "active" : ""}`}
              onClick={() => handleChangeView("customize")}
            >
              <Palette size={16} />
              <span>Customize UI</span>
            </button>
          </div>
        )}
        {(isTopnav || isRail) && (
          <button
            className={`nav-item ${view === "customize" ? "active" : ""}`}
            onClick={() => handleChangeView("customize")}
            title={isRail ? "Customize UI" : undefined}
          >
            <Palette size={isRail ? 20 : 16} />
            {!isRail && <span>Customize UI</span>}
          </button>
        )}
      </nav>
      {!isTopnav && !isRail && (
        <div className="sidebar-footer">
          <button className="sidebar-actions-toggle" onClick={() => setActionsOpen((o) => !o)}>
            <span>Actions</span>
            {actionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {actionsOpen && (
            <div className="sidebar-actions">
              <button className="sidebar-action-btn" onClick={onExportBackup}>Export Backup</button>
              <button className="sidebar-action-btn" onClick={onImportBackup}>Import Backup</button>
              <button className="sidebar-action-btn" onClick={onExportCsv}>Export CSV</button>
              {onSignOut ? <button className="sidebar-action-btn" onClick={onSignOut}>Sign Out</button> : null}
            </div>
          )}
        </div>
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
