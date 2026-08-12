import { Database } from 'node-sqlite3-wasm'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type {
  Account,
  Transaction,
  Import,
  Category,
  TransactionFilters,
  MonthlyStats,
  CategoryStats,
  CategoryStatsGrouped,
  DashboardSummary,
  ChatThread,
  ChatMemory,
  StoredChatMessage,
  MerchantStats,
  PeriodComparison,
  PeriodComparisonRow,
  UncategorizedSummary,
  NetBalance,
  RecurringFrequency,
  RecurringExpense,
  RecurringSummary,
  Asset,
  AssetInput,
  AssetLot,
  AssetLotInput,
  AssetTypeBreakdown,
  PatrimoineSummary,
  DcaPlan,
  DcaPlanInput
} from '../shared/types'
import { normalizeMerchant } from '../shared/merchant'
import { lookupMerchantDictionary } from '../shared/merchantDictionary'
import { findFuzzyCategory, type RememberedMerchant } from '../shared/categorization'

let db: Database
let activeDbPath = ''

export function getActiveDbPath(): string {
  return activeDbPath
}

export function initDatabase(dbPath?: string): void {
  // Le changement de profil ré-appelle initDatabase() sur une instance déjà
  // ouverte (voir switch-profile côté ipc.ts) : sans fermeture explicite, la
  // connexion précédente fuit (handle WAL non relâché).
  if (db) {
    try { db.close() } catch { /* déjà fermée */ }
  }
  activeDbPath = dbPath ?? path.join(app.getPath('userData'), 'banquier.db')
  db = new Database(activeDbPath)
  prepareSchema()
}

/** Mise en état du schéma sur une connexion fraîchement ouverte. Partagée par
 *  initDatabase() et restoreDb(), qui doivent aboutir à une base identique. */
function prepareSchema(): void {
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  // La mémoire marchand s'amorce à partir de l'historique déjà catégorisé, mais
  // une seule fois : si l'utilisateur la vide volontairement ensuite, on ne la
  // repeuple pas au démarrage suivant. D'où le relevé *avant* createTables().
  const memoryWasMissing = !tableExists('merchant_categories')
  createTables()
  migrate()
  seedCategories()
  if (memoryWasMissing) bootstrapMerchantMemory()
}

function tableExists(name: string): boolean {
  // `get` renvoie null (pas undefined) quand aucune ligne ne correspond.
  return db.get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", [name]) != null
}

export function closeDatabase(): void {
  db?.close()
}

function migrate(): void {
  const migrations = [
    'ALTER TABLE transactions ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE asset_lots ADD COLUMN plan_id INTEGER',
    'ALTER TABLE accounts ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1.0',
    'ALTER TABLE transactions ADD COLUMN note TEXT',
    'ALTER TABLE transactions ADD COLUMN tags TEXT',
    'ALTER TABLE chat_messages ADD COLUMN reasoning TEXT',
    'ALTER TABLE accounts ADD COLUMN balance REAL',
    'ALTER TABLE transactions ADD COLUMN merchant_key TEXT',
    'CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_key)',
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }
  rollbackRulePacksSchema()
  backfillMerchantKeys()
}

/**
 * Renseigne `merchant_key` pour les transactions qui n'en ont pas encore :
 * celles importées avant l'introduction de la colonne. Idempotent et borné par
 * le nombre de lignes concernées — il ne reste plus rien à faire une fois la
 * base à jour, donc le coût au démarrage retombe à une seule requête.
 */
function backfillMerchantKeys(): void {
  const rows = db.all(
    'SELECT id, description FROM transactions WHERE merchant_key IS NULL'
  ) as { id: number; description: string }[]
  if (rows.length === 0) return

  db.exec('BEGIN')
  try {
    for (const row of rows) {
      db.run('UPDATE transactions SET merchant_key = ? WHERE id = ?', [
        normalizeMerchant(row.description),
        row.id
      ])
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * Défait la migration introduite par les packs de règles (1.33.0), retirés
 * depuis.
 *
 * Cette version avait remplacé UNIQUE(pattern) par UNIQUE(pattern, source) sur
 * category_rules. Sans retour en arrière, upsertCategoryRule() échoue sur
 * « ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint »
 * dès qu'on crée ou modifie une règle.
 *
 * Les règles installées par un pack sont conservées : ce sont des lignes
 * ordinaires, utiles, et les supprimer changerait silencieusement la
 * catégorisation. En cas de doublon de pattern, la règle de l'utilisateur
 * l'emporte.
 */
function rollbackRulePacksSchema(): void {
  const columns = db.all('PRAGMA table_info(category_rules)') as { name: string }[]
  if (!columns.some((c) => c.name === 'source')) return

  db.exec('BEGIN')
  try {
    db.exec(`
      CREATE TABLE category_rules_restored (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern  TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL
      );
      INSERT INTO category_rules_restored (pattern, category)
        SELECT pattern, category FROM category_rules WHERE source = 'user';
      INSERT OR IGNORE INTO category_rules_restored (pattern, category)
        SELECT pattern, category FROM category_rules WHERE source <> 'user' ORDER BY priority, id;
      DROP TABLE category_rules;
      ALTER TABLE category_rules_restored RENAME TO category_rules;
      DROP TABLE IF EXISTS rule_packs;
      DROP TABLE IF EXISTS shared_rules;
    `)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      amount   REAL NOT NULL,
      period   TEXT NOT NULL DEFAULT 'mensuel'
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      bank     TEXT,
      currency TEXT DEFAULT 'EUR'
    );

    CREATE TABLE IF NOT EXISTS imports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      filename          TEXT,
      imported_at       TEXT NOT NULL,
      transaction_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER REFERENCES accounts(id),
      date        TEXT NOT NULL,
      description TEXT NOT NULL,
      amount      REAL NOT NULL,
      category    TEXT,
      import_id   INTEGER REFERENCES imports(id),
      -- Libellé réduit au marchand (voir shared/merchant.ts) : clé de
      -- regroupement pour la mémoire de catégorisation et la dédup LLM.
      merchant_key TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_key);

    CREATE TABLE IF NOT EXISTS categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(name, parent_id)
    );

    CREATE TABLE IF NOT EXISTS category_rules (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern  TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );

    -- Mémoire de catégorisation : ce que l'utilisateur a déjà décidé pour un
    -- marchand donné. Consultée à chaque import pour ne plus reposer la
    -- question. La dernière décision fait foi (voir rememberMerchantCategory).
    CREATE TABLE IF NOT EXISTS merchant_categories (
      merchant_key TEXT PRIMARY KEY,
      category     TEXT NOT NULL,
      count        INTEGER NOT NULL DEFAULT 1,
      last_used    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL DEFAULT 'Nouvelle conversation',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id  INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      tool_calls TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);

    CREATE TABLE IF NOT EXISTS chat_memories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      label      TEXT NOT NULL,
      quantity   REAL,
      value      REAL NOT NULL,
      currency   TEXT NOT NULL DEFAULT 'EUR',
      symbol     TEXT,
      notes      TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS networth_snapshots (
      date  TEXT PRIMARY KEY,
      value REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_lots (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      date       TEXT,
      quantity   REAL NOT NULL,
      unit_price REAL NOT NULL,
      fees       REAL NOT NULL DEFAULT 0,
      plan_id    INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_asset_lots_asset ON asset_lots(asset_id);

    CREATE TABLE IF NOT EXISTS dca_plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      amount     REAL NOT NULL,
      frequency  TEXT NOT NULL,
      day_ref    INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      fees       REAL NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS excluded_powens_accounts (
      powens_id  TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      target_amount REAL NOT NULL,
      target_date   TEXT,
      account_id    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      manual_amount REAL NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      archived      INTEGER NOT NULL DEFAULT 0
    );
  `)
}

const DEFAULT_CATEGORY_TREE: { name: string; children?: string[] }[] = [
  { name: 'Alimentation', children: ['Épicerie', 'Boulangerie / Traiteur', 'Marchés'] },
  { name: 'Restaurants', children: ['Fast-food', 'Cafés', 'Livraison repas'] },
  { name: 'Transport', children: ['Carburant', 'Transports en commun', 'Taxi / VTC', 'Stationnement'] },
  { name: 'Logement', children: ['Loyer', 'Électricité / Gaz', 'Internet / Téléphone', 'Entretien'] },
  { name: 'Shopping', children: ['Vêtements', 'Électronique', 'Maison / Déco'] },
  { name: 'Santé', children: ['Médecin / Dentiste', 'Pharmacie', 'Mutuelle'] },
  { name: 'Loisirs', children: ['Cinéma / Spectacles', 'Sport', 'Jeux / Hobbies'] },
  { name: 'Abonnements', children: ['Streaming', 'Presse / Livres', 'Logiciels'] },
  { name: 'Voyages', children: ['Transports voyage', 'Hébergement', 'Activités touristiques'] },
  { name: 'Épargne', children: ['Virement épargne', 'Investissements'] },
  { name: 'Salaire' },
  { name: 'Revenus', children: ['Freelance / Auto-entrepreneur', 'Aides / CAF', 'Remboursements'] },
  { name: 'Frais bancaires' },
  { name: 'Autre' }
]

function seedCategories(): void {
  const { n } = db.get('SELECT COUNT(*) AS n FROM categories') as { n: number }
  if (n > 0) return
  for (const cat of DEFAULT_CATEGORY_TREE) {
    try {
      const result = db.run('INSERT INTO categories (name, parent_id) VALUES (?, NULL)', [cat.name])
      const parentId = result.lastInsertRowid as number
      for (const child of cat.children ?? []) {
        try { db.run('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [child, parentId]) } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
}

// --- Accounts ---

export function getAccounts(): Account[] {
  return db.all('SELECT * FROM accounts ORDER BY name') as Account[]
}

export function createAccount(name: string, bank: string, currency: string): Account {
  const result = db.run(
    'INSERT INTO accounts (name, bank, currency) VALUES (?, ?, ?)',
    [name, bank, currency]
  )
  return db.get('SELECT * FROM accounts WHERE id = ?', [result.lastInsertRowid]) as Account
}

export function renameAccount(id: number, name: string): void {
  db.run('UPDATE accounts SET name = ? WHERE id = ?', [name, id])
}

export function deleteAccount(id: number): void {
  const account = db.get('SELECT * FROM accounts WHERE id = ?', [id]) as Account | undefined
  // Un compte Powens réapparaîtrait à la prochaine synchro si on ne mémorise pas
  // qu'il a été supprimé volontairement (Powens le renvoie toujours dans la liste).
  if (account?.bank?.startsWith('powens:')) {
    const powensId = account.bank.slice('powens:'.length)
    db.run(
      `INSERT INTO excluded_powens_accounts (powens_id, deleted_at) VALUES (?, ?)
       ON CONFLICT(powens_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [powensId, new Date().toISOString()]
    )
  }
  db.run('DELETE FROM transactions WHERE account_id = ?', [id])
  db.run('DELETE FROM accounts WHERE id = ?', [id])
}

export function getExcludedPowensAccountIds(): Set<string> {
  const rows = db.all('SELECT powens_id FROM excluded_powens_accounts') as { powens_id: string }[]
  return new Set(rows.map((r) => r.powens_id))
}

export function updateAccountCurrency(id: number, currency: string): void {
  db.run('UPDATE accounts SET currency = ? WHERE id = ?', [currency, id])
}

export function updateAccountFxRate(id: number, fxRate: number): void {
  db.run('UPDATE accounts SET fx_rate = ? WHERE id = ?', [fxRate, id])
}

export function updateAccountBalance(id: number, balance: number): void {
  db.run('UPDATE accounts SET balance = ? WHERE id = ?', [balance, id])
}

// --- Transactions ---

function buildTransactionWhere(filters: TransactionFilters): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.search) { conditions.push('t.description LIKE ?'); params.push(`%${filters.search}%`) }
  if (filters.category === '__none__') { conditions.push('t.category IS NULL') }
  else if (filters.category) {
    const escaped = filters.category.replace(/[\\%_]/g, '\\$&')
    conditions.push("(t.category = ? OR t.category LIKE ? ESCAPE '\\')")
    params.push(filters.category, `${escaped} > %`)
  }
  if (filters.accountId) { conditions.push('t.account_id = ?'); params.push(filters.accountId) }
  if (filters.startDate) { conditions.push('t.date >= ?'); params.push(filters.startDate) }
  if (filters.endDate) { conditions.push('t.date <= ?'); params.push(filters.endDate) }
  if (filters.minAmount !== undefined) { conditions.push('t.amount >= ?'); params.push(filters.minAmount) }
  if (filters.maxAmount !== undefined) { conditions.push('t.amount <= ?'); params.push(filters.maxAmount) }
  if (filters.tags) { conditions.push('t.tags LIKE ?'); params.push(`%${filters.tags}%`) }
  if (filters.isInternal !== undefined) { conditions.push('t.is_internal = ?'); params.push(filters.isInternal ? 1 : 0) }

  return { conditions, params }
}

const SORT_COLS: Record<string, string> = {
  date: 't.date', amount: 't.amount', description: 't.description', category: 't.category'
}

export function getTransactions(filters: TransactionFilters = {}): Transaction[] {
  const { conditions, params } = buildTransactionWhere(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const orderCol = SORT_COLS[filters.sortField ?? 'date'] ?? 't.date'
  const orderDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC'
  const orderBy = `ORDER BY ${orderCol} ${orderDir}${orderCol !== 't.date' ? ', t.date DESC' : ''}, t.id DESC`
  const limitClause = filters.limit ? `LIMIT ${filters.limit} OFFSET ${filters.offset ?? 0}` : ''
  const sql = `SELECT t.* FROM transactions t ${where} ${orderBy} ${limitClause}`
  return db.all(sql, params) as Transaction[]
}

export function countTransactions(filters: TransactionFilters = {}): number {
  const { conditions, params } = buildTransactionWhere(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = db.get(`SELECT COUNT(*) AS n FROM transactions t ${where}`, params) as { n: number }
  return row.n
}

export function insertTransactions(
  transactions: Omit<Transaction, 'id'>[],
  importId: number
): { imported: number; duplicates: number; insertedIds: number[] } {
  let imported = 0
  let duplicates = 0
  const insertedIds: number[] = []

  db.exec('BEGIN')
  try {
    for (const row of transactions) {
      const existing = db.get(
        'SELECT id FROM transactions WHERE date = ? AND description = ? AND amount = ?',
        [row.date, row.description, row.amount]
      )
      if (existing) {
        duplicates++
      } else {
        const result = db.run(
          'INSERT INTO transactions (account_id, date, description, amount, category, import_id, merchant_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            row.account_id ?? null, row.date, row.description, row.amount,
            row.category ?? null, importId, normalizeMerchant(row.description)
          ]
        )
        insertedIds.push(result.lastInsertRowid as number)
        imported++
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return { imported, duplicates, insertedIds }
}

export function setTransactionNote(id: number, note: string | null): void {
  db.run('UPDATE transactions SET note = ? WHERE id = ?', [note || null, id])
}

export function setTransactionTags(id: number, tags: string | null): void {
  db.run('UPDATE transactions SET tags = ? WHERE id = ?', [tags || null, id])
}

/**
 * Pose la catégorie choisie par l'utilisateur, et la mémorise pour le marchand.
 *
 * Deux portées distinctes, à ne pas confondre :
 * - la mémoire agit sur le **futur** (imports suivants), toujours ;
 * - `applyToSimilar` agit sur le **passé**, sur demande explicite.
 *
 * « Similaire » se juge sur la clé marchand et non plus sur l'égalité stricte
 * du libellé : un libellé réel embarquant date et référence, l'égalité stricte
 * ne rattrapait quasiment jamais rien.
 */
export function updateTransactionCategory(id: number, category: string, applyToSimilar = false): void {
  const tx = db.get('SELECT merchant_key FROM transactions WHERE id = ?', [id]) as
    { merchant_key: string | null } | undefined

  db.run('UPDATE transactions SET category = ? WHERE id = ?', [category, id])
  rememberMerchantCategory(tx?.merchant_key, category)

  if (applyToSimilar && tx?.merchant_key) {
    db.run('UPDATE transactions SET category = ? WHERE merchant_key = ?', [category, tx.merchant_key])
  }
}

export function countTransactionsByPattern(pattern: string): number {
  try {
    const regex = new RegExp(pattern, 'i')
    const rows = db.all('SELECT description FROM transactions') as { description: string }[]
    return rows.filter((r) => regex.test(r.description)).length
  } catch {
    return 0
  }
}

export function updateCategoryByPattern(category: string, pattern: string): number {
  try {
    const regex = new RegExp(pattern, 'i')
    const rows = db.all('SELECT id, description, merchant_key FROM transactions') as
      { id: number; description: string; merchant_key: string | null }[]
    const matched = rows.filter((r) => regex.test(r.description))
    if (matched.length === 0) return 0
    db.exec('BEGIN')
    try {
      for (const t of matched) {
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [category, t.id])
        rememberMerchantCategory(t.merchant_key, category)
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    return matched.length
  } catch {
    return 0
  }
}

/** Applique un lot de catégories validées (propositions IA acceptées). Chaque
 *  validation nourrit la mémoire marchand : c'est ce qui évite de refaire
 *  valider le même marchand au prochain relevé. */
export function batchUpdateCategories(updates: { id: number; category: string }[]): void {
  if (updates.length === 0) return
  db.exec('BEGIN')
  try {
    for (const u of updates) {
      const tx = db.get('SELECT merchant_key FROM transactions WHERE id = ?', [u.id]) as
        { merchant_key: string | null } | undefined
      db.run('UPDATE transactions SET category = ? WHERE id = ?', [u.category, u.id])
      rememberMerchantCategory(tx?.merchant_key, u.category)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function deleteTransactionsByImport(importId: number): void {
  db.run('DELETE FROM transactions WHERE import_id = ?', [importId])
  db.run('DELETE FROM imports WHERE id = ?', [importId])
}

// --- Imports ---

export function createImport(filename: string, transactionCount: number): Import {
  const now = new Date().toISOString()
  const result = db.run(
    'INSERT INTO imports (filename, imported_at, transaction_count) VALUES (?, ?, ?)',
    [filename, now, transactionCount]
  )
  return db.get('SELECT * FROM imports WHERE id = ?', [result.lastInsertRowid]) as Import
}

export function getImports(): Import[] {
  return db.all('SELECT * FROM imports ORDER BY imported_at DESC') as Import[]
}

// --- Patrimoine (actifs) ---

export function getAssets(): Asset[] {
  return db.all(
    `SELECT a.*,
       (SELECT COALESCE(SUM(l.quantity * l.unit_price + l.fees), 0)
          FROM asset_lots l WHERE l.asset_id = a.id) AS cost_basis,
       (SELECT COALESCE(SUM(l.quantity), 0)
          FROM asset_lots l WHERE l.asset_id = a.id) AS lot_quantity
     FROM assets a
     ORDER BY a.type, a.value DESC`
  ) as Asset[]
}

export function getAssetLots(assetId: number): AssetLot[] {
  return db.all('SELECT * FROM asset_lots WHERE asset_id = ? ORDER BY date', [assetId]) as AssetLot[]
}

function replaceAssetLots(assetId: number, lots: AssetLotInput[] | undefined): void {
  // Ne touche qu'aux lots manuels (plan_id NULL) ; les lots DCA sont gérés à part.
  db.run('DELETE FROM asset_lots WHERE asset_id = ? AND plan_id IS NULL', [assetId])
  for (const lot of lots ?? []) {
    if (!lot.quantity || lot.unit_price == null) continue
    db.run(
      'INSERT INTO asset_lots (asset_id, date, quantity, unit_price, fees, plan_id) VALUES (?, ?, ?, ?, ?, NULL)',
      [assetId, lot.date ?? null, lot.quantity, lot.unit_price, lot.fees ?? 0]
    )
  }
}

// --- DCA (investissement programmé) ---

export function getDcaPlanByAsset(assetId: number): DcaPlan | undefined {
  return db.get('SELECT * FROM dca_plans WHERE asset_id = ? AND active = 1', [assetId]) as
    | DcaPlan
    | undefined
}

export function createDcaPlan(assetId: number, input: DcaPlanInput): number {
  db.run('DELETE FROM dca_plans WHERE asset_id = ?', [assetId])
  const result = db.run(
    `INSERT INTO dca_plans (asset_id, amount, frequency, day_ref, start_date, fees, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [assetId, input.amount, input.frequency, input.day_ref, input.start_date, input.fees ?? 0]
  )
  return result.lastInsertRowid as number
}

export function deleteDcaPlansByAsset(assetId: number): void {
  db.run('DELETE FROM asset_lots WHERE asset_id = ? AND plan_id IS NOT NULL', [assetId])
  db.run('DELETE FROM dca_plans WHERE asset_id = ?', [assetId])
}

/** Remplace les lots générés par un plan DCA. */
export function replaceDcaLots(
  assetId: number,
  planId: number,
  lots: { date: string; quantity: number; unit_price: number; fees: number }[]
): void {
  db.run('DELETE FROM asset_lots WHERE plan_id = ?', [planId])
  for (const lot of lots) {
    db.run(
      'INSERT INTO asset_lots (asset_id, date, quantity, unit_price, fees, plan_id) VALUES (?, ?, ?, ?, ?, ?)',
      [assetId, lot.date, lot.quantity, lot.unit_price, lot.fees, planId]
    )
  }
}

/** Met à jour la valeur actuelle d'un actif et enregistre un instantané. */
export function setAssetValue(id: number, value: number): void {
  db.run('UPDATE assets SET value = ?, updated_at = ? WHERE id = ?', [
    value,
    new Date().toISOString(),
    id
  ])
  snapshotNetWorth()
}

/** Enregistre un instantané de la valeur nette totale pour aujourd'hui (un point/jour). */
function snapshotNetWorth(): void {
  const row = db.get('SELECT COALESCE(SUM(value), 0) AS total FROM assets') as { total: number }
  const today = new Date().toISOString().slice(0, 10)
  db.run(
    `INSERT INTO networth_snapshots (date, value) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET value = excluded.value`,
    [today, row.total]
  )
}

export function createAsset(input: AssetInput): Asset {
  const now = new Date().toISOString()
  const result = db.run(
    `INSERT INTO assets (type, label, quantity, value, currency, symbol, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.type,
      input.label,
      input.quantity ?? null,
      input.value,
      input.currency || 'EUR',
      input.symbol ?? null,
      input.notes ?? null,
      now,
      now
    ]
  )
  const assetId = result.lastInsertRowid as number
  replaceAssetLots(assetId, input.lots)
  snapshotNetWorth()
  return getAssets().find((a) => a.id === assetId) as Asset
}

export function updateAsset(id: number, input: AssetInput): void {
  db.run(
    `UPDATE assets SET type = ?, label = ?, quantity = ?, value = ?, currency = ?, symbol = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.type,
      input.label,
      input.quantity ?? null,
      input.value,
      input.currency || 'EUR',
      input.symbol ?? null,
      input.notes ?? null,
      new Date().toISOString(),
      id
    ]
  )
  replaceAssetLots(id, input.lots)
  snapshotNetWorth()
}

export function deleteAsset(id: number): void {
  db.run('DELETE FROM assets WHERE id = ?', [id])
  snapshotNetWorth()
}

export function getPatrimoineSummary(): PatrimoineSummary {
  const assets = getAssets()
  const totalValue = assets.reduce((sum, a) => sum + a.value, 0)
  const byType = db.all(
    `SELECT type, SUM(value) AS total, COUNT(*) AS count
     FROM assets GROUP BY type ORDER BY total DESC`
  ) as AssetTypeBreakdown[]
  const history = db.all(
    'SELECT date, value FROM networth_snapshots ORDER BY date ASC'
  ) as { date: string; value: number }[]
  // Plus/moins-value latente : uniquement les actifs suivis en lots (prix de revient connu).
  const tracked = assets.filter((a) => a.cost_basis > 0)
  const totalCostBasis = tracked.reduce((sum, a) => sum + a.cost_basis, 0)
  const totalGain = tracked.reduce((sum, a) => sum + (a.value - a.cost_basis), 0)
  return { totalValue, byType, assets, history, totalCostBasis, totalGain }
}

// --- Stats ---

export function getMonthlyStats(months = 6, anchorEnd?: string, excludeCategories?: string[]): MonthlyStats[] {
  // Fenêtre de `months` mois calendaires se terminant au mois de `anchorEnd`
  // (par défaut le mois courant). Permet de décaler la tendance selon le filtre.
  const anchor = anchorEnd ?? new Date().toISOString().slice(0, 10)
  const { clause: exclClause, params: exclParams } = buildExclClause(excludeCategories)
  return db.all(
    `SELECT
      strftime('%Y-%m', t.date) AS month,
      SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount * COALESCE(a.fx_rate, 1.0)) ELSE 0 END) AS total_debit,
      SUM(CASE WHEN t.amount > 0 THEN t.amount * COALESCE(a.fx_rate, 1.0) ELSE 0 END) AS total_credit
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.date >= date(?, 'start of month', '-' || ? || ' months')
      AND t.date <= date(?, 'start of month', '+1 month', '-1 day')
      AND t.is_internal = 0 ${exclClause}
    GROUP BY month
    ORDER BY month ASC`,
    [anchor, months - 1, anchor, ...exclParams]
  ) as MonthlyStats[]
}

function buildExclClause(excludeCategories?: string[]): { clause: string; params: unknown[] } {
  if (!excludeCategories?.length) return { clause: '', params: [] }
  // 'Non catégorisé' represents NULL categories — handle separately
  const excludeNull = excludeCategories.includes('Non catégorisé')
  const real = excludeCategories.filter(c => c !== 'Non catégorisé')
  const parents = real.filter(c => !c.includes(' > '))
  const p: unknown[] = []
  const parts: string[] = []
  if (real.length) { parts.push(`t.category NOT IN (${real.map(() => '?').join(',')})`); p.push(...real) }
  for (const parent of parents) { parts.push(`t.category NOT LIKE ?`); p.push(`${parent} > %`) }

  if (excludeNull && parts.length === 0) return { clause: 'AND t.category IS NOT NULL', params: [] }
  if (excludeNull) return { clause: `AND t.category IS NOT NULL AND ${parts.join(' AND ')}`, params: p }
  if (parts.length === 0) return { clause: '', params: [] }
  return { clause: `AND (t.category IS NULL OR (${parts.join(' AND ')}))`, params: p }
}

export function getCategoryStats(startDate?: string, endDate?: string, excludeCategories?: string[]): CategoryStats[] {
  const conditions: string[] = ['t.amount < 0', 't.is_internal = 0']
  const params: unknown[] = []

  if (startDate) { conditions.push('t.date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('t.date <= ?'); params.push(endDate) }
  if (excludeCategories?.length) {
    const { clause, params: ep } = buildExclClause(excludeCategories)
    conditions.push(clause.replace(/^AND /, ''))
    params.push(...ep)
  }

  return db.all(
    `SELECT
      COALESCE(t.category, 'Non catégorisé') AS category,
      SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total,
      COUNT(*) AS count
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY t.category
    ORDER BY total DESC`,
    params
  ) as CategoryStats[]
}

export function getCreditCategoryStats(startDate?: string, endDate?: string, excludeCategories?: string[]): CategoryStats[] {
  const conditions: string[] = ['t.amount > 0', 't.is_internal = 0']
  const params: unknown[] = []

  if (startDate) { conditions.push('t.date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('t.date <= ?'); params.push(endDate) }
  if (excludeCategories?.length) {
    const { clause, params: ep } = buildExclClause(excludeCategories)
    conditions.push(clause.replace(/^AND /, ''))
    params.push(...ep)
  }

  return db.all(
    `SELECT
      COALESCE(t.category, 'Non catégorisé') AS category,
      SUM(t.amount * COALESCE(a.fx_rate, 1.0)) AS total,
      COUNT(*) AS count
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY t.category
    ORDER BY total DESC`,
    params
  ) as CategoryStats[]
}

export function getCreditCategoryStatsGrouped(startDate?: string, endDate?: string, excludeCategories?: string[]): CategoryStatsGrouped[] {
  const flat = getCreditCategoryStats(startDate, endDate, excludeCategories)
  const parentMap = new Map<string, { total: number; count: number; subcategories: CategoryStats[] }>()

  for (const s of flat) {
    const sep = s.category.indexOf(' > ')
    if (sep !== -1) {
      const parent = s.category.slice(0, sep)
      const child = s.category.slice(sep + 3)
      if (!parentMap.has(parent)) parentMap.set(parent, { total: 0, count: 0, subcategories: [] })
      const entry = parentMap.get(parent)!
      entry.total += s.total
      entry.count += s.count
      entry.subcategories.push({ category: child, total: s.total, count: s.count })
    } else {
      if (!parentMap.has(s.category)) parentMap.set(s.category, { total: 0, count: 0, subcategories: [] })
      const entry = parentMap.get(s.category)!
      entry.total += s.total
      entry.count += s.count
    }
  }

  return Array.from(parentMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total)
}

export function getCategoryStatsGrouped(startDate?: string, endDate?: string, excludeCategories?: string[]): CategoryStatsGrouped[] {
  const flat = getCategoryStats(startDate, endDate, excludeCategories)
  const parentMap = new Map<string, { total: number; count: number; subcategories: CategoryStats[] }>()

  for (const s of flat) {
    const sep = s.category.indexOf(' > ')
    if (sep !== -1) {
      const parent = s.category.slice(0, sep)
      const child = s.category.slice(sep + 3)
      if (!parentMap.has(parent)) parentMap.set(parent, { total: 0, count: 0, subcategories: [] })
      const entry = parentMap.get(parent)!
      entry.total += s.total
      entry.count += s.count
      entry.subcategories.push({ category: child, total: s.total, count: s.count })
    } else {
      if (!parentMap.has(s.category)) parentMap.set(s.category, { total: 0, count: 0, subcategories: [] })
      const entry = parentMap.get(s.category)!
      entry.total += s.total
      entry.count += s.count
    }
  }

  return Array.from(parentMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total)
}

export function getCategoryMonthlyHistory(category: string, months = 12): { month: string; total: number }[] {
  const start = new Date()
  start.setMonth(start.getMonth() - months)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  return db.all(
    `SELECT strftime('%Y-%m', t.date) AS month,
      SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.amount < 0
      AND t.is_internal = 0
      AND (t.category = ? OR t.category LIKE ? || ' > %')
      AND t.date >= ?
    GROUP BY month
    ORDER BY month ASC`,
    [category, category, startStr]
  ) as { month: string; total: number }[]
}

export function getDashboardSummary(startDate?: string, endDate?: string, excludeCategories?: string[]): DashboardSummary {
  const today = new Date()
  const effectiveEnd = endDate ?? today.toISOString().slice(0, 10)

  let effectiveStart: string
  let prevStart: string
  let prevEnd: string

  const { clause: exclClause, params: exclParams } = buildExclClause(excludeCategories)

  if (startDate) {
    effectiveStart = startDate
    const start = new Date(startDate)
    const end = new Date(effectiveEnd)
    const durationMs = end.getTime() - start.getTime()
    const pe = new Date(start.getTime() - 86400000)
    const ps = new Date(pe.getTime() - durationMs)
    prevEnd = pe.toISOString().slice(0, 10)
    prevStart = ps.toISOString().slice(0, 10)
  } else {
    // « Tout » : pas de date de début → on couvre tout l'historique en
    // calant le début sur la transaction la plus ancienne.
    const firstRow = db.get(
      `SELECT MIN(t.date) AS d FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.is_internal = 0 ${exclClause}`,
      exclParams
    ) as { d: string | null } | undefined
    effectiveStart = firstRow?.d ?? today.toISOString().slice(0, 7) + '-01'
    const pmFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const pmLast = new Date(today.getFullYear(), today.getMonth(), 0)
    prevStart = pmFirst.toISOString().slice(0, 10)
    prevEnd = pmLast.toISOString().slice(0, 10)
  }

  const periodStats = (s: string, e: string): { total_debit: number; total_credit: number } => {
    const row = db.get(
      `SELECT
        SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount * COALESCE(a.fx_rate, 1.0)) ELSE 0 END) AS total_debit,
        SUM(CASE WHEN t.amount > 0 THEN t.amount * COALESCE(a.fx_rate, 1.0) ELSE 0 END) AS total_credit
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.date >= ? AND t.date <= ? AND t.is_internal = 0 ${exclClause}`,
      [s, e, ...exclParams]
    ) as { total_debit: number | null; total_credit: number | null } | undefined
    return { total_debit: row?.total_debit ?? 0, total_credit: row?.total_credit ?? 0 }
  }

  const current = periodStats(effectiveStart, effectiveEnd)
  const previous = periodStats(prevStart, prevEnd)
  const countRow = db.get('SELECT COUNT(*) AS n FROM transactions') as { n: number } | undefined

  // Tendance calée sur le filtre : fenêtre d'au moins 6 mois se terminant au
  // mois de fin de la période, élargie pour couvrir toute la période filtrée.
  const monthSpan = (fromISO: string, toISO: string): number => {
    const f = new Date(fromISO), t = new Date(toISO)
    return (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth()) + 1
  }
  let trendMonths = 6
  let trendAnchor: string | undefined
  let trendHighlightStart: string | null = null
  let trendHighlightEnd: string | null = null
  if (startDate) {
    trendMonths = Math.max(6, monthSpan(effectiveStart, effectiveEnd))
    trendAnchor = effectiveEnd
    trendHighlightStart = effectiveStart.slice(0, 7)
    trendHighlightEnd = effectiveEnd.slice(0, 7)
  } else {
    // « Tout » : la tendance couvre tout l'historique (sans surlignage,
    // puisque l'intégralité du graphique correspond à la période).
    trendMonths = Math.max(6, monthSpan(effectiveStart, effectiveEnd))
    trendAnchor = effectiveEnd
  }

  return {
    periodDebit: current.total_debit,
    periodCredit: current.total_credit,
    previousPeriodDebit: previous.total_debit,
    totalTransactions: countRow?.n ?? 0,
    topCategories: getCategoryStatsGrouped(effectiveStart, effectiveEnd, excludeCategories),
    topIncomeCategories: getCreditCategoryStatsGrouped(effectiveStart, effectiveEnd, excludeCategories),
    monthlyTrend: getMonthlyStats(trendMonths, trendAnchor, excludeCategories),
    trendHighlightStart,
    trendHighlightEnd
  }
}

export function getLatestPowensTransactionDate(): string | null {
  const row = db.get(
    `SELECT MAX(t.date) AS d FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE a.bank LIKE 'powens:%'`
  ) as { d: string | null } | undefined
  return row?.d ?? null
}

export function getDistinctCategories(): string[] {
  const rows = db.all(
    'SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL ORDER BY category'
  ) as { category: string }[]
  return rows.map((r) => r.category)
}

// --- Category management ---

export function getCategoryTree(): Category[] {
  return db.all('SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name') as Category[]
}

export function getCategoryPaths(): string[] {
  const all = getCategoryTree()
  const byId = new Map(all.map((c) => [c.id, c]))
  return all
    .map((c) => {
      if (c.parent_id === null) return c.name
      const parent = byId.get(c.parent_id)
      return parent ? `${parent.name} > ${c.name}` : c.name
    })
    .sort()
}

export function createCategory(name: string, parentId?: number): Category {
  const result = db.run(
    'INSERT INTO categories (name, parent_id) VALUES (?, ?)',
    [name.trim(), parentId ?? null]
  )
  return db.get('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowid]) as Category
}

export function deleteCategory(id: number): void {
  db.run('DELETE FROM categories WHERE id = ? OR parent_id = ?', [id, id])
}

export function renameCategory(id: number, name: string): void {
  const newName = name.trim()
  const cat = db.get('SELECT name, parent_id FROM categories WHERE id = ?', [id]) as
    { name: string; parent_id: number | null } | undefined
  if (!cat) return

  db.exec('BEGIN')
  try {
    if (cat.parent_id === null) {
      // Top-level rename: update "OldName" and "OldName > *"
      const old = cat.name
      // % et _ dans le nom sont des jokers LIKE — les échapper pour ne pas
      // faire déraper le renommage vers des catégories sans rapport
      // (ex. "100% Bio" matcherait aussi "1000000 Bio").
      const escapedOld = old.replace(/[\\%_]/g, '\\$&')
      db.run('UPDATE transactions SET category = ? WHERE category = ?', [newName, old])
      db.run('UPDATE category_rules SET category = ? WHERE category = ?', [newName, old])
      // Sans cela la mémoire continuerait de désigner l'ancien nom et le
      // ressusciterait au prochain import.
      db.run('UPDATE merchant_categories SET category = ? WHERE category = ?', [newName, old])

      const subRows = db.all(
        "SELECT id, category FROM transactions WHERE category LIKE ? ESCAPE '\\'",
        [escapedOld + ' > %']
      ) as { id: number; category: string }[]
      for (const row of subRows) {
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [
          newName + row.category.slice(old.length), row.id
        ])
      }
      const ruleRows = db.all(
        "SELECT id, category FROM category_rules WHERE category LIKE ? ESCAPE '\\'",
        [escapedOld + ' > %']
      ) as { id: number; category: string }[]
      for (const row of ruleRows) {
        db.run('UPDATE category_rules SET category = ? WHERE id = ?', [
          newName + row.category.slice(old.length), row.id
        ])
      }
      const memoryRows = db.all(
        "SELECT merchant_key, category FROM merchant_categories WHERE category LIKE ? ESCAPE '\\'",
        [escapedOld + ' > %']
      ) as { merchant_key: string; category: string }[]
      for (const row of memoryRows) {
        db.run('UPDATE merchant_categories SET category = ? WHERE merchant_key = ?', [
          newName + row.category.slice(old.length), row.merchant_key
        ])
      }
    } else {
      // Sub-category rename: update "Parent > OldName"
      const parent = db.get('SELECT name FROM categories WHERE id = ?', [cat.parent_id]) as
        { name: string } | undefined
      if (parent) {
        const oldPath = `${parent.name} > ${cat.name}`
        const newPath = `${parent.name} > ${newName}`
        db.run('UPDATE transactions SET category = ? WHERE category = ?', [newPath, oldPath])
        db.run('UPDATE category_rules SET category = ? WHERE category = ?', [newPath, oldPath])
        db.run('UPDATE merchant_categories SET category = ? WHERE category = ?', [newPath, oldPath])
      }
    }

    db.run('UPDATE categories SET name = ? WHERE id = ?', [newName, id])
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function setTransactionInternal(id: number, isInternal: boolean): void {
  db.run('UPDATE transactions SET is_internal = ? WHERE id = ?', [isInternal ? 1 : 0, id])
}

export function setTransactionInternalByCategory(category: string, isInternal: boolean): number {
  const escaped = category.replace(/[\\%_]/g, '\\$&')
  const result = db.run(
    "UPDATE transactions SET is_internal = ? WHERE (category = ? OR category LIKE ? ESCAPE '\\')",
    [isInternal ? 1 : 0, category, `${escaped} > %`]
  )
  return result.changes as number
}

// --- Mémoire marchand ---
//
// Ce que l'utilisateur a déjà décidé pour un marchand donné, rejoué
// automatiquement aux imports suivants. C'est le mécanisme qui fait qu'une
// correction ne se redemande jamais : sans lui, chaque relevé repose les mêmes
// questions puisque les libellés bancaires ne se répètent jamais à l'identique.

/**
 * Enregistre la décision de l'utilisateur pour un marchand.
 *
 * La dernière décision fait foi : quand la catégorie diffère de celle en
 * mémoire, elle la remplace au lieu de voter à la majorité. Un utilisateur qui
 * vient de corriger attend que sa correction tienne, pas qu'elle soit
 * minoritaire face à l'historique. `count` reste le nombre de décisions
 * enregistrées, pour pouvoir présenter les marchands les plus établis.
 */
export function rememberMerchantCategory(
  merchantKey: string | null | undefined,
  category: string
): void {
  const key = (merchantKey ?? '').trim()
  const cat = category.trim()
  if (!key || !cat) return

  db.run(
    `INSERT INTO merchant_categories (merchant_key, category, count, last_used)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(merchant_key) DO UPDATE SET
       category  = excluded.category,
       count     = merchant_categories.count + 1,
       last_used = excluded.last_used`,
    [key, cat, new Date().toISOString()]
  )
}

/**
 * Applique la mémoire aux transactions données. Ne touche que celles sans
 * catégorie : la mémoire complète le travail, elle ne réécrit jamais par-dessus
 * un choix déjà posé.
 */
export function applyMerchantMemory(transactionIds: number[]): number {
  if (transactionIds.length === 0) return 0

  const CHUNK = 200
  let updated = 0

  db.exec('BEGIN')
  try {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = db.all(
        `SELECT t.id, m.category
         FROM transactions t
         JOIN merchant_categories m ON m.merchant_key = t.merchant_key
         WHERE t.id IN (${placeholders}) AND t.category IS NULL`,
        chunk
      ) as { id: number; category: string }[]

      for (const row of rows) {
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [row.category, row.id])
        // Même convention que les règles : une catégorie « interne » marque
        // aussi la transaction comme virement interne.
        if (row.category.toLowerCase().includes('intern')) {
          db.run('UPDATE transactions SET is_internal = 1 WHERE id = ?', [row.id])
        }
        updated++
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return updated
}

/**
 * Amorce la mémoire à partir de l'historique déjà catégorisé, à la création de
 * la table. Sans cela, un utilisateur qui a classé 2 000 transactions à la main
 * repartirait de zéro et se verrait reposer toutes les questions.
 *
 * Pour un marchand classé dans plusieurs catégories au fil du temps, la
 * catégorie la plus fréquente l'emporte ; à égalité, la plus récente.
 */
function bootstrapMerchantMemory(): void {
  const rows = db.all(
    `SELECT merchant_key, category, COUNT(*) AS n, MAX(date) AS last_date
     FROM transactions
     WHERE category IS NOT NULL AND category <> '' AND merchant_key IS NOT NULL AND merchant_key <> ''
     GROUP BY merchant_key, category`
  ) as { merchant_key: string; category: string; n: number; last_date: string }[]
  if (rows.length === 0) return

  const best = new Map<string, { category: string; n: number; last_date: string }>()
  for (const row of rows) {
    const current = best.get(row.merchant_key)
    const wins =
      !current || row.n > current.n || (row.n === current.n && row.last_date > current.last_date)
    if (wins) best.set(row.merchant_key, row)
  }

  db.exec('BEGIN')
  try {
    for (const [key, entry] of best) {
      db.run(
        `INSERT INTO merchant_categories (merchant_key, category, count, last_used)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(merchant_key) DO NOTHING`,
        [key, entry.category, entry.n, entry.last_date]
      )
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// --- Category rules ---

export function upsertCategoryRule(pattern: string, category: string): void {
  db.run(
    'INSERT INTO category_rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category',
    [pattern, category]
  )
}

export function getCategoryRules(): { pattern: string; category: string }[] {
  return db.all('SELECT pattern, category FROM category_rules ORDER BY id') as { pattern: string; category: string }[]
}

export function getCategoryRulesWithId(): { id: number; pattern: string; category: string }[] {
  return db.all('SELECT id, pattern, category FROM category_rules ORDER BY id') as { id: number; pattern: string; category: string }[]
}

export function deleteCategoryRule(id: number): void {
  db.run('DELETE FROM category_rules WHERE id = ?', [id])
}

export function updateCategoryRule(id: number, pattern: string, category: string): void {
  db.run('UPDATE category_rules SET pattern = ?, category = ? WHERE id = ?', [pattern, category, id])
}

export function findDuplicateTransactions(): Transaction[][] {
  const groups = db.all(
    `SELECT date, amount, description FROM transactions GROUP BY date, amount, description HAVING COUNT(*) > 1 ORDER BY date DESC`
  ) as { date: string; amount: number; description: string }[]
  return groups.map((g) =>
    db.all(
      'SELECT * FROM transactions WHERE date = ? AND amount = ? AND description = ? ORDER BY id',
      [g.date, g.amount, g.description]
    ) as Transaction[]
  )
}

export function deleteTransaction(id: number): void {
  db.run('DELETE FROM transactions WHERE id = ?', [id])
}

export function clearAllTransactions(): void {
  db.run('DELETE FROM transactions')
  db.run('DELETE FROM imports')
}

// --- Budgets ---

export interface BudgetRow {
  id: number
  category: string
  amount: number
  period: string
}

export function getBudgets(): BudgetRow[] {
  return db.all('SELECT * FROM budgets ORDER BY category') as BudgetRow[]
}

export function upsertBudget(category: string, amount: number): BudgetRow {
  db.run(
    'INSERT INTO budgets (category, amount, period) VALUES (?, ?, ?) ON CONFLICT(category) DO UPDATE SET amount = excluded.amount',
    [category, amount, 'mensuel']
  )
  return db.get('SELECT * FROM budgets WHERE category = ?', [category]) as BudgetRow
}

export function deleteBudget(id: number): void {
  db.run('DELETE FROM budgets WHERE id = ?', [id])
}

export function getBudgetsWithSpent(startDate?: string, endDate?: string): (BudgetRow & { spent: number })[] {
  const budgets = getBudgets()
  if (budgets.length === 0) return []

  const conditions = ['t.amount < 0', 't.is_internal = 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('t.date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('t.date <= ?'); params.push(endDate) }

  const spentRows = db.all(
    `SELECT COALESCE(t.category, 'Non catégorisé') AS category, SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY t.category`,
    params
  ) as { category: string; total: number }[]

  const spentMap = new Map(spentRows.map((r) => [r.category, r.total]))

  return budgets.map((b) => {
    let spent = 0
    for (const [cat, total] of spentMap) {
      if (cat === b.category || cat.startsWith(b.category + ' > ')) {
        spent += total
      }
    }
    return { ...b, spent }
  })
}

// --- Objectifs d'épargne ---

export interface SavingsGoalRow {
  id: number
  name: string
  target_amount: number
  target_date: string | null
  account_id: number | null
  manual_amount: number
  created_at: string
  archived: number
}

export interface SavingsGoalWithProgress extends SavingsGoalRow {
  /** Compte lié : solde converti (fx_rate) si connu. Sinon (pas de compte lié
   *  ou solde inconnu) : montant saisi manuellement (manual_amount). */
  currentAmount: number
  /** false si un compte est lié mais que son solde n'est pas connu (compte manuel sans sync). */
  balanceKnown: boolean
  accountName: string | null
}

export function getSavingsGoals(): SavingsGoalRow[] {
  return db.all('SELECT * FROM savings_goals WHERE archived = 0 ORDER BY created_at DESC') as SavingsGoalRow[]
}

export function createSavingsGoal(
  name: string,
  targetAmount: number,
  targetDate: string | null,
  accountId: number | null
): SavingsGoalRow {
  const now = new Date().toISOString()
  const result = db.run(
    'INSERT INTO savings_goals (name, target_amount, target_date, account_id, manual_amount, created_at, archived) VALUES (?, ?, ?, ?, 0, ?, 0)',
    [name.trim(), targetAmount, targetDate, accountId, now]
  )
  return db.get('SELECT * FROM savings_goals WHERE id = ?', [result.lastInsertRowid]) as SavingsGoalRow
}

export function updateSavingsGoal(
  id: number,
  name: string,
  targetAmount: number,
  targetDate: string | null,
  accountId: number | null
): void {
  db.run(
    'UPDATE savings_goals SET name = ?, target_amount = ?, target_date = ?, account_id = ? WHERE id = ?',
    [name.trim(), targetAmount, targetDate, accountId, id]
  )
}

/** Met à jour le montant épargné saisi à la main (objectifs sans compte lié, ou en complément). */
export function updateSavingsGoalManualAmount(id: number, amount: number): void {
  db.run('UPDATE savings_goals SET manual_amount = ? WHERE id = ?', [Math.max(0, amount), id])
}

export function deleteSavingsGoal(id: number): void {
  db.run('DELETE FROM savings_goals WHERE id = ?', [id])
}

export function getSavingsGoalsWithProgress(): SavingsGoalWithProgress[] {
  const goals = getSavingsGoals()
  if (goals.length === 0) return []
  const accounts = db.all('SELECT * FROM accounts') as Account[]
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  return goals.map((g) => {
    if (g.account_id != null) {
      const account = accountById.get(g.account_id)
      const balanceKnown = account?.balance != null
      const currentAmount = balanceKnown ? (account!.balance as number) * account!.fx_rate : 0
      return { ...g, currentAmount, balanceKnown, accountName: account?.name ?? null }
    }
    return { ...g, currentAmount: g.manual_amount, balanceKnown: true, accountName: null }
  })
}

/** Dépense mensuelle moyenne d'une catégorie (sous-catégories incluses) sur les N derniers mois complets. */
export function getCategoryMonthlyAverage(
  category: string,
  months = 3
): { average: number; monthsWithData: number } {
  const escaped = category.replace(/[\\%_]/g, '\\$&')
  const rows = db.all(
    `SELECT strftime('%Y-%m', t.date) AS month, SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.amount < 0 AND t.is_internal = 0
       AND (t.category = ? OR t.category LIKE ? ESCAPE '\\')
       AND t.date >= date('now', 'start of month', '-' || ? || ' months')
       AND t.date < date('now', 'start of month')
     GROUP BY month`,
    [category, `${escaped} > %`, months]
  ) as { month: string; total: number }[]
  if (rows.length === 0) return { average: 0, monthsWithData: 0 }
  const total = rows.reduce((s, r) => s + r.total, 0)
  return { average: total / rows.length, monthsWithData: rows.length }
}

export function exportDb(destPath: string): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  fs.copyFileSync(activeDbPath, destPath)
}

export function restoreDb(sourcePath: string): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.close()
  fs.copyFileSync(sourcePath, activeDbPath)
  db = new Database(activeDbPath)
  prepareSchema()
}

export function exportTransactionsToCsv(): string {
  const rows = db.all(`
    SELECT t.date, t.description, t.amount, t.category, a.name AS account
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    ORDER BY t.date DESC, t.id DESC
  `) as { date: string; description: string; amount: number; category: string | null; account: string | null }[]

  const escape = (v: string | null) => v == null ? '' : `"${v.replace(/"/g, '""')}"`
  const header = 'Date,Description,Montant,Catégorie,Compte'
  const lines = rows.map((r) => [
    r.date,
    escape(r.description),
    r.amount.toString().replace('.', ','),
    escape(r.category),
    escape(r.account)
  ].join(';'))

  return '﻿' + [header, ...lines].join('\r\n')
}

// --- Analyse avancée (outils IA) ---

export function getTopMerchants(startDate?: string, endDate?: string, limit = 15): MerchantStats[] {
  const conditions = ['amount < 0', 'is_internal = 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('date <= ?'); params.push(endDate) }

  const rows = db.all(
    `SELECT description, amount FROM transactions WHERE ${conditions.join(' AND ')}`,
    params
  ) as { description: string; amount: number }[]

  const map = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const key = normalizeMerchant(r.description)
    const entry = map.get(key) ?? { total: 0, count: 0 }
    entry.total += Math.abs(r.amount)
    entry.count += 1
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .map(([merchant, v]) => ({ merchant, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.min(limit, 50))
}

export function getLargestTransactions(
  startDate?: string,
  endDate?: string,
  limit = 10,
  direction: 'debit' | 'credit' = 'debit'
): Transaction[] {
  const conditions = ['is_internal = 0', direction === 'credit' ? 'amount > 0' : 'amount < 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('date <= ?'); params.push(endDate) }

  return db.all(
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')}
     ORDER BY ABS(amount) DESC LIMIT ${Math.min(limit, 50)}`,
    params
  ) as Transaction[]
}

export function comparePeriods(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): PeriodComparison {
  const a = getCategoryStats(aStart, aEnd)
  const b = getCategoryStats(bStart, bEnd)
  const byCat = new Map<string, { totalA: number; totalB: number }>()

  for (const s of a) {
    const e = byCat.get(s.category) ?? { totalA: 0, totalB: 0 }
    e.totalA += s.total
    byCat.set(s.category, e)
  }
  for (const s of b) {
    const e = byCat.get(s.category) ?? { totalA: 0, totalB: 0 }
    e.totalB += s.total
    byCat.set(s.category, e)
  }

  const categories: PeriodComparisonRow[] = Array.from(byCat.entries())
    .map(([category, v]) => ({
      category,
      totalA: v.totalA,
      totalB: v.totalB,
      diff: v.totalB - v.totalA,
      pct: v.totalA > 0 ? ((v.totalB - v.totalA) / v.totalA) * 100 : null
    }))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))

  const sum = (rows: CategoryStats[]): number => rows.reduce((acc, r) => acc + r.total, 0)

  return {
    periodA: { startDate: aStart, endDate: aEnd, totalDebit: sum(a) },
    periodB: { startDate: bStart, endDate: bEnd, totalDebit: sum(b) },
    categories
  }
}

export function getUncategorized(startDate?: string, endDate?: string, limit = 20): UncategorizedSummary {
  const conditions = ['category IS NULL', 'is_internal = 0', 'amount < 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('date <= ?'); params.push(endDate) }
  const where = `WHERE ${conditions.join(' AND ')}`

  const agg = db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions ${where}`,
    params
  ) as { count: number; total: number }

  const sample = db.all(
    `SELECT * FROM transactions ${where} ORDER BY ABS(amount) DESC LIMIT ${Math.min(limit, 50)}`,
    params
  ) as Transaction[]

  return { count: agg.count, total: agg.total, sample }
}

export function getNetBalance(startDate?: string, endDate?: string): NetBalance {
  const conditions = ['t.is_internal = 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('t.date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('t.date <= ?'); params.push(endDate) }

  const row = db.get(
    `SELECT
      COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount * COALESCE(a.fx_rate, 1.0) ELSE 0 END), 0) AS total_credit,
      COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount * COALESCE(a.fx_rate, 1.0)) ELSE 0 END), 0) AS total_debit
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}`,
    params
  ) as { total_credit: number; total_debit: number }

  return {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    totalCredit: row.total_credit,
    totalDebit: row.total_debit,
    net: row.total_credit - row.total_debit
  }
}

// --- Dépenses récurrentes (abonnements, prélèvements réguliers) ---

const RECURRING_FREQUENCIES: { freq: RecurringFrequency; days: number; perMonth: number }[] = [
  { freq: 'hebdomadaire', days: 7,   perMonth: 52 / 12 },
  { freq: 'mensuel',      days: 30,  perMonth: 1 },
  { freq: 'bimestriel',   days: 60,  perMonth: 1 / 2 },
  { freq: 'trimestriel',  days: 91,  perMonth: 1 / 3 },
  { freq: 'semestriel',   days: 182, perMonth: 1 / 6 },
  { freq: 'annuel',       days: 365, perMonth: 1 / 12 }
]

/** Associe un intervalle médian (en jours) à la fréquence la plus proche, ou null si trop éloigné. */
function classifyFrequency(medianDays: number): { freq: RecurringFrequency; perMonth: number } | null {
  let best: { freq: RecurringFrequency; perMonth: number } | null = null
  let bestErr = Infinity
  for (const f of RECURRING_FREQUENCIES) {
    const err = Math.abs(medianDays - f.days) / f.days
    // tolérance de 25 % autour de la fréquence théorique
    if (err <= 0.25 && err < bestErr) {
      bestErr = err
      best = { freq: f.freq, perMonth: f.perMonth }
    }
  }
  return best
}

function mostCommonCategory(txs: Transaction[]): string | null {
  const counts = new Map<string, number>()
  for (const t of txs) {
    if (!t.category) continue
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [cat, n] of counts) {
    if (n > bestN) { best = cat; bestN = n }
  }
  return best
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function getRecurringExpenses(
  startDate?: string,
  endDate?: string
): RecurringSummary {
  return detectRecurringTransactions('debit', startDate, endDate)
}

/** Revenus récurrents (salaire, virements réguliers…) — même algorithme que
 *  getRecurringExpenses, appliqué aux transactions créditrices. */
export function getRecurringIncome(
  startDate?: string,
  endDate?: string
): RecurringSummary {
  return detectRecurringTransactions('credit', startDate, endDate)
}

function detectRecurringTransactions(
  direction: 'debit' | 'credit',
  startDate?: string,
  endDate?: string
): RecurringSummary {
  const conditions = [direction === 'debit' ? 'amount < 0' : 'amount > 0', 'is_internal = 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('date <= ?'); params.push(endDate) }

  const rows = db.all(
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date ASC`,
    params
  ) as Transaction[]

  // Regroupe par marchand normalisé.
  const groups = new Map<string, Transaction[]>()
  for (const r of rows) {
    const key = normalizeMerchant(r.description)
    if (!key) continue
    const arr = groups.get(key)
    if (arr) arr.push(r)
    else groups.set(key, [r])
  }

  const items: RecurringExpense[] = []
  const now = Date.now()

  for (const [merchant, txs] of groups) {
    // Au moins 3 occurrences pour confirmer une régularité.
    if (txs.length < 3) continue

    const times = txs.map((t) => new Date(t.date).getTime())
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push((times[i] - times[i - 1]) / 86_400_000)
    }
    const med = median(intervals)
    if (med <= 0) continue

    const classified = classifyFrequency(med)
    if (!classified) continue

    // Vérifie la régularité : coefficient de variation des intervalles.
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1
    if (cv > 0.5) continue // intervalles trop irréguliers : ce n'est pas un abonnement

    const amounts = txs.map((t) => Math.abs(t.amount))
    const averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const last = txs[txs.length - 1]
    const daysSinceLast = (now - new Date(last.date).getTime()) / 86_400_000
    const active = daysSinceLast <= med * 2 // actif si dernière occurrence < 2 intervalles attendus

    const monthlyEstimate = averageAmount * classified.perMonth

    items.push({
      merchant,
      category: mostCommonCategory(txs),
      frequency: classified.freq,
      occurrences: txs.length,
      averageAmount,
      lastAmount: Math.abs(last.amount),
      firstDate: txs[0].date,
      lastDate: last.date,
      intervalDays: Math.round(med),
      monthlyEstimate,
      yearlyEstimate: monthlyEstimate * 12,
      active,
      transactions: [...txs].reverse()
    })
  }

  items.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)

  const activeItems = items.filter((i) => i.active)
  return {
    items,
    totalMonthlyActive: activeItems.reduce((acc, i) => acc + i.monthlyEstimate, 0),
    totalYearlyActive: activeItems.reduce((acc, i) => acc + i.yearlyEstimate, 0)
  }
}

// --- Chat threads (mémoire conversationnelle) ---

const DEFAULT_THREAD_TITLE = 'Nouvelle conversation'

function parseToolCalls(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) && arr.length > 0 ? arr : undefined
  } catch {
    return undefined
  }
}

export function createChatThread(title = DEFAULT_THREAD_TITLE): ChatThread {
  const now = new Date().toISOString()
  const result = db.run(
    'INSERT INTO chat_threads (title, created_at, updated_at) VALUES (?, ?, ?)',
    [title, now, now]
  )
  return db.get('SELECT * FROM chat_threads WHERE id = ?', [result.lastInsertRowid]) as ChatThread
}

export function getChatThreads(): ChatThread[] {
  return db.all('SELECT * FROM chat_threads ORDER BY updated_at DESC') as ChatThread[]
}

export function getChatMessages(threadId: number): StoredChatMessage[] {
  const rows = db.all(
    'SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY id ASC',
    [threadId]
  ) as { id: number; thread_id: number; role: string; content: string; tool_calls: string | null; reasoning: string | null; created_at: string }[]
  return rows.map((r) => ({
    id: r.id,
    thread_id: r.thread_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    toolCalls: parseToolCalls(r.tool_calls),
    reasoning: r.reasoning ?? undefined,
    created_at: r.created_at
  }))
}

export function addChatMessage(
  threadId: number,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: string[],
  reasoning?: string
): void {
  const now = new Date().toISOString()
  db.run(
    'INSERT INTO chat_messages (thread_id, role, content, tool_calls, reasoning, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [threadId, role, content, toolCalls?.length ? JSON.stringify(toolCalls) : null, reasoning || null, now]
  )
  db.run('UPDATE chat_threads SET updated_at = ? WHERE id = ?', [now, threadId])
}

export function autoTitleChatThread(threadId: number, firstUserMessage: string): void {
  const thread = db.get('SELECT title FROM chat_threads WHERE id = ?', [threadId]) as
    { title: string } | undefined
  if (!thread || thread.title !== DEFAULT_THREAD_TITLE) return
  const title = firstUserMessage.trim().replace(/\s+/g, ' ').slice(0, 50) || DEFAULT_THREAD_TITLE
  db.run('UPDATE chat_threads SET title = ? WHERE id = ?', [title, threadId])
}

export function renameChatThread(id: number, title: string): void {
  db.run('UPDATE chat_threads SET title = ? WHERE id = ?', [title.trim() || DEFAULT_THREAD_TITLE, id])
}

export function deleteChatThread(id: number): void {
  db.run('DELETE FROM chat_messages WHERE thread_id = ?', [id])
  db.run('DELETE FROM chat_threads WHERE id = ?', [id])
}

// --- Mémoire IA (informations importantes, base du RAG) ---

export function addChatMemory(content: string): ChatMemory {
  const now = new Date().toISOString()
  const result = db.run('INSERT INTO chat_memories (content, created_at) VALUES (?, ?)', [
    content.trim(),
    now
  ])
  return db.get('SELECT * FROM chat_memories WHERE id = ?', [result.lastInsertRowid]) as ChatMemory
}

export function getChatMemories(): ChatMemory[] {
  return db.all('SELECT * FROM chat_memories ORDER BY id DESC') as ChatMemory[]
}

export function deleteChatMemory(id: number): void {
  db.run('DELETE FROM chat_memories WHERE id = ?', [id])
}

/** IDs des transactions encore non catégorisées pour les comptes donnés. */
export function getUncategorizedTransactionIds(accountIds: number[]): number[] {
  if (accountIds.length === 0) return []
  const placeholders = accountIds.map(() => '?').join(',')
  const rows = db.all(
    `SELECT id FROM transactions WHERE category IS NULL AND account_id IN (${placeholders})`,
    accountIds
  ) as { id: number }[]
  return rows.map((r) => r.id)
}

/**
 * Cascade de catégorisation automatique, à confiance décroissante.
 *
 * Point d'entrée unique de tout ce qui catégorise sans intervention : imports
 * CSV/PDF, synchro Powens, et première passe avant l'IA. Les couches suivantes
 * (dictionnaire embarqué, repli flou) viendront s'y ajouter, sans avoir à
 * retoucher les appelants.
 *
 * 1. règles de l'utilisateur — explicites, elles priment et peuvent réécrire ;
 * 2. mémoire marchand — ses décisions passées, sur les seules non catégorisées.
 */
export function autoCategorize(transactionIds: number[]): number {
  if (transactionIds.length === 0) return 0
  return (
    applyRulesToTransactions(transactionIds) +
    applyMerchantMemory(transactionIds) +
    applyFuzzyMerchantMemory(transactionIds) +
    applyMerchantDictionary(transactionIds)
  )
}

/**
 * Rattrape les marchands proches de ceux déjà décidés (voir findFuzzyCategory).
 *
 * Passe **avant** le dictionnaire embarqué : un choix de l'utilisateur, même
 * rapproché de façon approximative, vaut mieux qu'une liste générique livrée
 * avec l'application. Sinon un utilisateur qui classe volontairement
 * « CARREFOUR MARKET PARIS » en Shopping verrait le magasin de la ville d'à
 * côté repartir en Alimentation.
 */
export function applyFuzzyMerchantMemory(transactionIds: number[]): number {
  if (transactionIds.length === 0) return 0

  const memory = db.all(
    'SELECT merchant_key, category, count FROM merchant_categories'
  ) as RememberedMerchant[]
  if (memory.length === 0) return 0

  const CHUNK = 200
  let updated = 0

  db.exec('BEGIN')
  try {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = db.all(
        `SELECT id, merchant_key FROM transactions
         WHERE id IN (${placeholders}) AND category IS NULL AND merchant_key IS NOT NULL`,
        chunk
      ) as { id: number; merchant_key: string }[]

      for (const row of rows) {
        const category = findFuzzyCategory(row.merchant_key, memory)
        if (!category) continue
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [category, row.id])
        updated++
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return updated
}

/**
 * Applique le dictionnaire d'enseignes embarqué aux transactions encore sans
 * catégorie. Il couvre le premier import, quand la mémoire est vide.
 *
 * Le résultat n'est **pas** écrit en mémoire marchand : le dictionnaire est
 * déterministe et rejoué à chaque import, l'y recopier créerait une seconde
 * source de vérité qu'une correction ultérieure du dictionnaire ne pourrait
 * plus rattraper.
 */
export function applyMerchantDictionary(transactionIds: number[]): number {
  if (transactionIds.length === 0) return 0

  const known = new Set(getCategoryPaths())
  const CHUNK = 200
  let updated = 0

  db.exec('BEGIN')
  try {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = db.all(
        `SELECT id, merchant_key, amount FROM transactions
         WHERE id IN (${placeholders}) AND category IS NULL AND merchant_key IS NOT NULL`,
        chunk
      ) as { id: number; merchant_key: string; amount: number }[]

      for (const row of rows) {
        const proposed = lookupMerchantDictionary(row.merchant_key, row.amount)
        if (!proposed) continue
        const category = resolveKnownCategory(proposed, known)
        if (!category) continue
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [category, row.id])
        updated++
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return updated
}

/**
 * Ramène une catégorie du dictionnaire à celles qui existent réellement chez
 * l'utilisateur : il a pu supprimer ou renommer une sous-catégorie par défaut.
 * On retombe alors sur la catégorie parente plutôt que d'inventer une entrée
 * fantôme qui n'apparaîtrait dans aucun filtre ni budget.
 */
function resolveKnownCategory(category: string, known: Set<string>): string | null {
  if (known.has(category)) return category
  const sep = category.indexOf(' > ')
  if (sep !== -1) {
    const parent = category.slice(0, sep)
    if (known.has(parent)) return parent
  }
  return null
}

export function applyRulesToTransactions(transactionIds: number[]): number {
  if (transactionIds.length === 0) return 0
  const rules = getCategoryRules()
  if (rules.length === 0) return 0

  // Pre-compile regexes once
  const compiled = rules.map((r) => {
    try { return { regex: new RegExp(r.pattern, 'i'), category: r.category } } catch { return null }
  }).filter(Boolean) as { regex: RegExp; category: string }[]
  if (compiled.length === 0) return 0

  const CHUNK = 200
  let updated = 0

  db.exec('BEGIN')
  try {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = db.all(
        `SELECT id, description FROM transactions WHERE id IN (${placeholders})`,
        chunk
      ) as { id: number; description: string }[]

      for (const tx of rows) {
        for (const rule of compiled) {
          if (rule.regex.test(tx.description)) {
            db.run('UPDATE transactions SET category = ? WHERE id = ?', [rule.category, tx.id])
            if (rule.category.toLowerCase().includes('intern')) {
              db.run('UPDATE transactions SET is_internal = 1 WHERE id = ?', [tx.id])
            }
            updated++
            break
          }
        }
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return updated
}
