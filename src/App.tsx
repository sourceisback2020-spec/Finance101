import { useEffect, useState } from "react";
import { AuthView } from "./features/auth/AuthView";
import { AiCommandBox } from "./features/ai/AiCommandBox";
import { BanksView } from "./features/banks/BanksView";
import { CreditCardsView } from "./features/creditCards/CreditCardsView";
import { CustomizeView } from "./features/customize/CustomizeView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { RetirementView } from "./features/retirement401k/RetirementView";
import { ScenariosView } from "./features/scenarios/ScenariosView";
import { SubscriptionsView } from "./features/subscriptions/SubscriptionsView";
import { TransactionsView } from "./features/transactions/TransactionsView";
import type { HostedUser } from "./data/supabaseAuth";
import {
  getHostedUser,
  isHostedAuthEnabled,
  onHostedAuthStateChange,
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
    return <AuthView error={authError} onSignIn={onSignIn} onSignUp={onSignUp} />;
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
      <AiCommandBox />
      {view === "dashboard" && <DashboardView />}
      {view === "transactions" && <TransactionsView />}
      {view === "subscriptions" && <SubscriptionsView />}
      {view === "cards" && <CreditCardsView />}
      {view === "banks" && <BanksView />}
      {view === "scenarios" && <ScenariosView />}
      {view === "retirement" && <RetirementView />}
      {view === "customize" && <CustomizeView />}
    </AppLayout>
  );
}

export default App;
