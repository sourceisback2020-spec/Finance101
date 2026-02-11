import { useEffect } from "react";
import { BanksView } from "./features/banks/BanksView";
import { CreditCardsView } from "./features/creditCards/CreditCardsView";
import { CustomizeView } from "./features/customize/CustomizeView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { RetirementView } from "./features/retirement401k/RetirementView";
import { ScenariosView } from "./features/scenarios/ScenariosView";
import { SubscriptionsView } from "./features/subscriptions/SubscriptionsView";
import { TransactionsView } from "./features/transactions/TransactionsView";
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

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

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

  return (
    <AppLayout
      view={view}
      onChangeView={setView}
      onExportCsv={() => void exportCsv()}
      onExportBackup={() => void onExportBackup()}
      onImportBackup={() => void onImportBackup()}
    >
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
