import { contextBridge, ipcRenderer } from "electron";
const financeApi = {
    listTransactions: () => ipcRenderer.invoke("transactions:list"),
    upsertTransaction: (transaction) => ipcRenderer.invoke("transactions:upsert", transaction),
    bulkInsertTransactions: (transactions) => ipcRenderer.invoke("transactions:bulkInsert", transactions),
    deleteTransaction: (id) => ipcRenderer.invoke("transactions:delete", id),
    listSubscriptions: () => ipcRenderer.invoke("subscriptions:list"),
    upsertSubscription: (subscription) => ipcRenderer.invoke("subscriptions:upsert", subscription),
    deleteSubscription: (id) => ipcRenderer.invoke("subscriptions:delete", id),
    listCards: () => ipcRenderer.invoke("cards:list"),
    upsertCard: (card) => ipcRenderer.invoke("cards:upsert", card),
    deleteCard: (id) => ipcRenderer.invoke("cards:delete", id),
    listScenarios: () => ipcRenderer.invoke("scenarios:list"),
    upsertScenario: (scenario) => ipcRenderer.invoke("scenarios:upsert", scenario),
    deleteScenario: (id) => ipcRenderer.invoke("scenarios:delete", id),
    listRetirementEntries: () => ipcRenderer.invoke("retirement:list"),
    upsertRetirementEntry: (entry) => ipcRenderer.invoke("retirement:upsert", entry),
    deleteRetirementEntry: (id) => ipcRenderer.invoke("retirement:delete", id),
    listBanks: () => ipcRenderer.invoke("banks:list"),
    upsertBank: (account) => ipcRenderer.invoke("banks:upsert", account),
    deleteBank: (id) => ipcRenderer.invoke("banks:delete", id),
    getUiPreferences: () => ipcRenderer.invoke("settings:getUiPreferences"),
    setUiPreferences: (prefs) => ipcRenderer.invoke("settings:setUiPreferences", prefs),
    exportTransactionsCsv: () => ipcRenderer.invoke("transactions:exportCsv"),
    saveBackupJson: (payload) => ipcRenderer.invoke("backup:saveJson", payload),
    openBackupJson: () => ipcRenderer.invoke("backup:openJson")
};
contextBridge.exposeInMainWorld("financeApi", financeApi);
