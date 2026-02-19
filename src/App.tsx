import { useEffect, useState } from "react";
import { AuthView } from "./features/auth/AuthView";
import { AiCommandBox } from "./features/ai/AiCommandBox";
import { BanksView } from "./features/banks/BanksView";
import { BudgetsView } from "./features/budgets/BudgetsView";
import { CreditCardsView } from "./features/creditCards/CreditCardsView";
import { CustomizeView } from "./features/customize/CustomizeView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { GoalsView } from "./features/goals/GoalsView";
import { RetirementView } from "./features/retirement401k/RetirementView";
import { ScenariosView } from "./features/scenarios/ScenariosView";
import { SubscriptionsView } from "./features/subscriptions/SubscriptionsView";
import { TransactionsView } from "./features/transactions/TransactionsView";
import type { HostedUser } from "./data/supabaseAuth";
import {
  getHostedUser,
  isHostedAuthEnabled,
  onHostedAuthStateChange,
  resetHostedSession,
  signInHosted,
  signOutHosted,
  signUpHosted
} from "./data/supabaseAuth";
import { useFinanceStore } from "./state/store";
import { AppLayout } from "./ui/layout/AppLayout";
import "./App.css";

function App() {
  const refreshAll = useFinanceStore((state) => state.refreshAll);
  const view = useFinanceStore((state) => state.view);
  const setView = useFinanceStore((state) => state.setView);
  const exportCsv = useFinanceStore((state) => state.exportCsv);
  const exportBackup = useFinanceStore((state) => state.exportBackup);
  const importBackup = useFinanceStore((state) => state.importBackup);
  const [authLoading, setAuthLoading] = useState(true);
  const [hostedUser, setHostedUser] = useState<HostedUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const hostedAuthEnabled = isHostedAuthEnabled();

  useEffect(() => {
    if (!hostedAuthEnabled) {
      setAuthLoading(false);
      return;
    }
    void getHostedUser().then((user) => {
      setHostedUser(user);
      setAuthLoading(false);
    });
    const subscription = onHostedAuthStateChange((_event, session) => {
      setHostedUser(session?.user ?? null);
      setAuthError(null);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [hostedAuthEnabled]);

  useEffect(() => {
    if (hostedAuthEnabled && !hostedUser) return;
    void refreshAll();
  }, [refreshAll, hostedAuthEnabled, hostedUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hostedAuthEnabled && !hostedUser) return;

    const storagePrefix = "finance:panelCollapsed:";

    const slugify = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const applyCollapsedState = (panel: HTMLElement, button: HTMLButtonElement, collapsed: boolean) => {
      panel.dataset.collapsed = collapsed ? "true" : "false";
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.textContent = collapsed ? "▾" : "▴";
    };

    const decoratePanels = () => {
      const panels = document.querySelectorAll<HTMLElement>(".content .panel");
      panels.forEach((panel, index) => {
        if (panel.dataset.collapsibleReady === "true") return;

        let header = panel.querySelector<HTMLElement>(":scope > .panel-head");
        if (!header) {
          const heading = panel.querySelector<HTMLElement>(":scope > h3, :scope > h2");
          if (heading) {
            const wrapper = document.createElement("div");
            wrapper.className = "panel-head panel-collapsible-head";
            panel.insertBefore(wrapper, heading);
            wrapper.appendChild(heading);
            header = wrapper;
          } else {
            const wrapper = document.createElement("div");
            wrapper.className = "panel-head panel-collapsible-head";
            const title = document.createElement("h3");
            title.textContent = "Section";
            wrapper.appendChild(title);
            panel.prepend(wrapper);
            header = wrapper;
          }
        }

        const scopeTitle = panel.closest("section")?.querySelector("header h2")?.textContent ?? "app";
        const headingTitle = header.querySelector("h2, h3")?.textContent ?? `panel-${index}`;
        const panelKey = `${slugify(scopeTitle)}:${slugify(headingTitle)}:${index}`;
        panel.dataset.panelKey = panelKey;

        Array.from(panel.children).forEach((child) => {
          if (child !== header) {
            child.classList.add("panel-collapse-target");
          }
        });

        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "panel-collapse-btn";
        toggleButton.title = "Collapse/Expand section";
        toggleButton.setAttribute("aria-label", "Collapse/Expand section");
        const stored = window.localStorage.getItem(`${storagePrefix}${panelKey}`) === "1";
        applyCollapsedState(panel, toggleButton, stored);
        toggleButton.addEventListener("click", () => {
          const nextCollapsed = panel.dataset.collapsed !== "true";
          applyCollapsedState(panel, toggleButton, nextCollapsed);
          window.localStorage.setItem(`${storagePrefix}${panelKey}`, nextCollapsed ? "1" : "0");
        });
        header.appendChild(toggleButton);

        panel.dataset.collapsibleReady = "true";
      });
    };

    let frameId: number | null = null;
    const scheduleDecorate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        decoratePanels();
      });
    };

    decoratePanels();
    const contentRoot = document.querySelector<HTMLElement>(".content");
    if (!contentRoot) return;
    const observer = new MutationObserver(() => scheduleDecorate());
    observer.observe(contentRoot, { childList: true, subtree: false });
    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [hostedAuthEnabled, hostedUser]);

  const onSignIn = async (email: string, password: string) => {
    const { error } = await signInHosted(email, password);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthError(null);
  };

  const onSignUp = async (email: string, password: string) => {
    const { error } = await signUpHosted(email, password);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthError(null);
  };

  const onSignOut = async () => {
    await signOutHosted();
    setHostedUser(null);
  };

  const onResetSession = async () => {
    await resetHostedSession();
    setHostedUser(null);
    setAuthError(null);
  };

  const onExportBackup = async () => {
    const ok = await exportBackup();
    if (!ok) return;
    window.alert("Full backup exported successfully.");
  };

  const onImportBackup = async () => {
    try {
      const ok = await importBackup();
      if (!ok) return;
      window.alert("Backup imported successfully. Restart the app if theme settings look stale.");
    } catch {
      window.alert("Could not import backup. Ensure you selected a valid backup JSON file.");
    }
  };

  if (authLoading) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h1>Loading...</h1>
          <p className="muted">Checking secure session.</p>
        </section>
      </div>
    );
  }

  if (hostedAuthEnabled && !hostedUser) {
    return <AuthView error={authError} onSignIn={onSignIn} onSignUp={onSignUp} onResetSession={onResetSession} />;
  }

  return (
    <AppLayout
      view={view}
      onChangeView={setView}
      onExportCsv={() => void exportCsv()}
      onExportBackup={() => void onExportBackup()}
      onImportBackup={() => void onImportBackup()}
      authEmail={hostedUser?.email}
      onSignOut={hostedAuthEnabled ? () => void onSignOut() : undefined}
    >
      {view === "dashboard" ? <AiCommandBox /> : null}
      {view === "dashboard" && <DashboardView />}
      {view === "transactions" && <TransactionsView />}
      {view === "subscriptions" && <SubscriptionsView />}
      {view === "cards" && <CreditCardsView />}
      {view === "banks" && <BanksView />}
      {view === "budgets" && <BudgetsView />}
      {view === "goals" && <GoalsView />}
      {view === "scenarios" && <ScenariosView />}
      {view === "retirement" && <RetirementView />}
      {view === "customize" && <CustomizeView />}
    </AppLayout>
  );
}

export default App;
