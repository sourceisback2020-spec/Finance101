import { BarChart3, CreditCard, DollarSign, Landmark, Palette, PiggyBank, Repeat, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

type AppView = "dashboard" | "transactions" | "subscriptions" | "cards" | "banks" | "scenarios" | "retirement" | "customize";

type Props = {
  view: AppView;
  onChangeView: (view: AppView) => void;
  onExportCsv: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  children: ReactNode;
};

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "transactions", label: "Income & Expenses", icon: DollarSign },
  { id: "subscriptions", label: "Subscriptions", icon: Repeat },
  { id: "cards", label: "Credit Cards", icon: CreditCard },
  { id: "banks", label: "Bank Accounts", icon: PiggyBank },
  { id: "scenarios", label: "What-If Scenarios", icon: Sparkles },
  { id: "retirement", label: "401k Tracker", icon: Landmark },
  { id: "customize", label: "Customize UI", icon: Palette }
] as const;

export function AppLayout({ view, onChangeView, onExportCsv, onExportBackup, onImportBackup, children }: Props) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Local Finance Planner</h1>
        <p className="sidebar-subtitle">A clean desktop hub for your money decisions.</p>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => onChangeView(item.id)}
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
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

