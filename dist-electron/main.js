import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let db;
function dbPath() {
    return path.join(app.getPath("userData"), "finance.db");
}
function ensureDb() {
    db = new Database(dbPath());
    db.pragma("journal_mode = WAL");
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      merchant TEXT NOT NULL,
      account TEXT NOT NULL,
      note TEXT NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cost REAL NOT NULL,
      frequency TEXT NOT NULL,
      nextDueDate TEXT NOT NULL,
      category TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS credit_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance REAL NOT NULL,
      limitAmount REAL NOT NULL,
      apr REAL NOT NULL,
      minPayment REAL NOT NULL,
      dueDate TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      purchaseAmount REAL NOT NULL,
      durationMonths INTEGER NOT NULL,
      paymentType TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      accountId TEXT NOT NULL DEFAULT 'unassigned',
      scheduleDate TEXT NOT NULL DEFAULT '',
      isApplied INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS retirement_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      employeeContribution REAL NOT NULL,
      employerMatch REAL NOT NULL,
      balance REAL NOT NULL,
      annualReturn REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      institution TEXT NOT NULL,
      nickname TEXT NOT NULL,
      type TEXT NOT NULL,
      currentBalance REAL NOT NULL,
      availableBalance REAL NOT NULL,
      apy REAL NOT NULL,
      lastUpdated TEXT NOT NULL
    );
  `);
    const scenarioColumns = db.prepare("PRAGMA table_info(scenarios)").all();
    const hasColumn = (name) => scenarioColumns.some((column) => column.name === name);
    if (!hasColumn("accountId")) {
        db.exec("ALTER TABLE scenarios ADD COLUMN accountId TEXT NOT NULL DEFAULT 'unassigned';");
    }
    if (!hasColumn("scheduleDate")) {
        db.exec("ALTER TABLE scenarios ADD COLUMN scheduleDate TEXT NOT NULL DEFAULT '';");
    }
    if (!hasColumn("isApplied")) {
        db.exec("ALTER TABLE scenarios ADD COLUMN isApplied INTEGER NOT NULL DEFAULT 0;");
    }
}
function seedDefaults() {
    const accountCount = db.prepare("SELECT COUNT(*) as count FROM accounts").get();
    if (accountCount.count === 0) {
        const insert = db.prepare("INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)");
        insert.run("acc-checking", "Checking", "bank");
        insert.run("acc-credit", "Credit Card", "credit");
        insert.run("acc-cash", "Cash", "cash");
    }
    const categoryCount = db.prepare("SELECT COUNT(*) as count FROM categories").get();
    if (categoryCount.count === 0) {
        const insert = db.prepare("INSERT INTO categories (id, name, type) VALUES (?, ?, ?)");
        [
            ["cat-paycheck", "Paycheck", "income"],
            ["cat-freelance", "Freelance", "income"],
            ["cat-groceries", "Groceries", "expense"],
            ["cat-rent", "Rent", "expense"],
            ["cat-utilities", "Utilities", "expense"],
            ["cat-transport", "Transport", "expense"],
            ["cat-entertainment", "Entertainment", "expense"]
        ].forEach((row) => insert.run(...row));
    }
}
function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 760,
        backgroundColor: "#0b1020",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (isDev) {
        const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5273";
        win.loadURL(devUrl);
    }
    else {
        win.loadFile(path.join(__dirname, "../dist/index.html"));
    }
}
ipcMain.handle("transactions:list", () => {
    return db.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
});
ipcMain.handle("transactions:upsert", (_e, tx) => {
    db.prepare(`
    INSERT INTO transactions (id, date, amount, type, category, merchant, account, note, recurring)
    VALUES (@id, @date, @amount, @type, @category, @merchant, @account, @note, @recurring)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      amount = excluded.amount,
      type = excluded.type,
      category = excluded.category,
      merchant = excluded.merchant,
      account = excluded.account,
      note = excluded.note,
      recurring = excluded.recurring
  `).run(tx);
    return true;
});
ipcMain.handle("transactions:bulkInsert", (_e, transactions) => {
    const insert = db.prepare(`
    INSERT OR REPLACE INTO transactions
    (id, date, amount, type, category, merchant, account, note, recurring)
    VALUES (@id, @date, @amount, @type, @category, @merchant, @account, @note, @recurring)
  `);
    const tx = db.transaction((rows) => rows.forEach((row) => insert.run(row)));
    tx(transactions);
    return true;
});
ipcMain.handle("transactions:delete", (_e, id) => {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
    return true;
});
ipcMain.handle("subscriptions:list", () => {
    return db.prepare("SELECT * FROM subscriptions ORDER BY nextDueDate ASC").all();
});
ipcMain.handle("subscriptions:upsert", (_e, sub) => {
    db.prepare(`
    INSERT INTO subscriptions (id, name, cost, frequency, nextDueDate, category, isActive)
    VALUES (@id, @name, @cost, @frequency, @nextDueDate, @category, @isActive)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      cost = excluded.cost,
      frequency = excluded.frequency,
      nextDueDate = excluded.nextDueDate,
      category = excluded.category,
      isActive = excluded.isActive
  `).run(sub);
    return true;
});
ipcMain.handle("subscriptions:delete", (_e, id) => {
    db.prepare("DELETE FROM subscriptions WHERE id = ?").run(id);
    return true;
});
ipcMain.handle("cards:list", () => {
    return db.prepare("SELECT * FROM credit_cards ORDER BY name ASC").all();
});
ipcMain.handle("cards:upsert", (_e, card) => {
    db.prepare(`
    INSERT INTO credit_cards (id, name, balance, limitAmount, apr, minPayment, dueDate)
    VALUES (@id, @name, @balance, @limitAmount, @apr, @minPayment, @dueDate)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      balance = excluded.balance,
      limitAmount = excluded.limitAmount,
      apr = excluded.apr,
      minPayment = excluded.minPayment,
      dueDate = excluded.dueDate
  `).run(card);
    return true;
});
ipcMain.handle("cards:delete", (_e, id) => {
    db.prepare("DELETE FROM credit_cards WHERE id = ?").run(id);
    return true;
});
ipcMain.handle("scenarios:list", () => {
    return db.prepare("SELECT * FROM scenarios ORDER BY createdAt DESC").all();
});
ipcMain.handle("scenarios:upsert", (_e, scenario) => {
    db.prepare(`
    INSERT INTO scenarios (id, name, purchaseAmount, durationMonths, paymentType, createdAt, accountId, scheduleDate, isApplied)
    VALUES (@id, @name, @purchaseAmount, @durationMonths, @paymentType, @createdAt, @accountId, @scheduleDate, @isApplied)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      purchaseAmount = excluded.purchaseAmount,
      durationMonths = excluded.durationMonths,
      paymentType = excluded.paymentType,
      createdAt = excluded.createdAt,
      accountId = excluded.accountId,
      scheduleDate = excluded.scheduleDate,
      isApplied = excluded.isApplied
  `).run(scenario);
    return true;
});
ipcMain.handle("scenarios:delete", (_e, id) => {
    db.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
    return true;
});
ipcMain.handle("retirement:list", () => {
    return db.prepare("SELECT * FROM retirement_entries ORDER BY date DESC").all();
});
ipcMain.handle("retirement:upsert", (_e, entry) => {
    db.prepare(`
    INSERT INTO retirement_entries (id, date, employeeContribution, employerMatch, balance, annualReturn)
    VALUES (@id, @date, @employeeContribution, @employerMatch, @balance, @annualReturn)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      employeeContribution = excluded.employeeContribution,
      employerMatch = excluded.employerMatch,
      balance = excluded.balance,
      annualReturn = excluded.annualReturn
  `).run(entry);
    return true;
});
ipcMain.handle("retirement:delete", (_e, id) => {
    db.prepare("DELETE FROM retirement_entries WHERE id = ?").run(id);
    return true;
});
ipcMain.handle("banks:list", () => {
    return db.prepare("SELECT * FROM bank_accounts ORDER BY institution ASC, nickname ASC").all();
});
ipcMain.handle("banks:upsert", (_e, account) => {
    db.prepare(`
    INSERT INTO bank_accounts (id, institution, nickname, type, currentBalance, availableBalance, apy, lastUpdated)
    VALUES (@id, @institution, @nickname, @type, @currentBalance, @availableBalance, @apy, @lastUpdated)
    ON CONFLICT(id) DO UPDATE SET
      institution = excluded.institution,
      nickname = excluded.nickname,
      type = excluded.type,
      currentBalance = excluded.currentBalance,
      availableBalance = excluded.availableBalance,
      apy = excluded.apy,
      lastUpdated = excluded.lastUpdated
  `).run(account);
    return true;
});
ipcMain.handle("banks:delete", (_e, id) => {
    db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(id);
    return true;
});
const defaultUiPreferences = {
    theme: "midnight",
    background: "aurora",
    density: "cozy",
    glassMode: true,
    motionEffects: true
};
ipcMain.handle("settings:getUiPreferences", () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("ui.preferences");
    if (!row?.value) {
        return defaultUiPreferences;
    }
    try {
        return { ...defaultUiPreferences, ...JSON.parse(row.value) };
    }
    catch {
        return defaultUiPreferences;
    }
});
ipcMain.handle("settings:setUiPreferences", (_e, prefs) => {
    db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run("ui.preferences", JSON.stringify(prefs));
    return true;
});
ipcMain.handle("transactions:exportCsv", async () => {
    const rows = db.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
    const csv = [
        "id,date,amount,type,category,merchant,account,note,recurring",
        ...rows.map((row) => [
            row.id,
            row.date,
            row.amount,
            row.type,
            row.category,
            row.merchant,
            row.account,
            `"${String(row.note).replaceAll("\"", "\"\"")}"`,
            row.recurring
        ].join(","))
    ].join("\n");
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Export Transactions CSV",
        defaultPath: path.join(app.getPath("documents"), "transactions-export.csv"),
        filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (canceled || !filePath) {
        return false;
    }
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, csv, "utf8");
    return true;
});
ipcMain.handle("backup:saveJson", async (_e, payload) => {
    const datePart = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Export Full Finance Backup",
        defaultPath: path.join(app.getPath("documents"), `local-finance-backup-${datePart}.json`),
        filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (canceled || !filePath) {
        return false;
    }
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, payload, "utf8");
    return true;
});
ipcMain.handle("backup:openJson", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Import Finance Backup",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (canceled || filePaths.length === 0) {
        return null;
    }
    return readFileSync(filePaths[0], "utf8");
});
app.whenReady().then(() => {
    ensureDb();
    seedDefaults();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
