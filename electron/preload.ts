import { contextBridge, ipcRenderer } from "electron";

const financeApi = {
  listTransactions: () => ipcRenderer.invoke("transactions:list"),
  upsertTransaction: (transaction: unknown) => ipcRenderer.invoke("transactions:upsert", transaction),
  bulkInsertTransactions: (transactions: unknown[]) => ipcRenderer.invoke("transactions:bulkInsert", transactions),
  deleteTransaction: (id: string) => ipcRenderer.invoke("transactions:delete", id),
  listSubscriptions: () => ipcRenderer.invoke("subscriptions:list"),
  upsertSubscription: (subscription: unknown) => ipcRenderer.invoke("subscriptions:upsert", subscription),
  deleteSubscription: (id: string) => ipcRenderer.invoke("subscriptions:delete", id),
  listCards: () => ipcRenderer.invoke("cards:list"),
  upsertCard: (card: unknown) => ipcRenderer.invoke("cards:upsert", card),
  deleteCard: (id: string) => ipcRenderer.invoke("cards:delete", id),
  listScenarios: () => ipcRenderer.invoke("scenarios:list"),
  upsertScenario: (scenario: unknown) => ipcRenderer.invoke("scenarios:upsert", scenario),
  deleteScenario: (id: string) => ipcRenderer.invoke("scenarios:delete", id),
  listRetirementEntries: () => ipcRenderer.invoke("retirement:list"),
  upsertRetirementEntry: (entry: unknown) => ipcRenderer.invoke("retirement:upsert", entry),
  deleteRetirementEntry: (id: string) => ipcRenderer.invoke("retirement:delete", id),
  listBanks: () => ipcRenderer.invoke("banks:list"),
  upsertBank: (account: unknown) => ipcRenderer.invoke("banks:upsert", account),
  deleteBank: (id: string) => ipcRenderer.invoke("banks:delete", id),
  getUiPreferences: () => ipcRenderer.invoke("settings:getUiPreferences"),
  setUiPreferences: (prefs: unknown) => ipcRenderer.invoke("settings:setUiPreferences", prefs),
  exportTransactionsCsv: () => ipcRenderer.invoke("transactions:exportCsv"),
  saveBackupJson: (payload: string) => ipcRenderer.invoke("backup:saveJson", payload),
  openBackupJson: () => ipcRenderer.invoke("backup:openJson")
};

contextBridge.exposeInMainWorld("financeApi", financeApi);

