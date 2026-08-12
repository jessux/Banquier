import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { looksLikeInternalCategory, USER_RULE_PRIORITY } from '../shared/rulePacks'

const DB_NAME = 'banquier'

const sqlite = new SQLiteConnection(CapacitorSQLite)
let db: SQLiteDBConnection | null = null

function getDb(): SQLiteDBConnection {
  if (!db) throw new Error('Mobile database not initialized — call initDatabase() first')
  return db
}

/** Thin async wrappers mirroring the sync node-sqlite3-wasm API used by src/main/database.ts,
 *  so the ported Phase 1 query logic can stay structurally close to the desktop original. */
export async function all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await getDb().query(sql, params as unknown[])
  return (res.values ?? []) as T[]
}

export async function get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params)
  return rows[0]
}

export async function run(
  sql: string,
  params: unknown[] = []
): Promise<{ lastInsertRowid: number; changes: number }> {
  // Le plugin encapsule par défaut CHAQUE run() dans sa propre transaction
  // implicite (3ᵉ paramètre `transaction`, true par défaut). À l'intérieur d'un
  // transaction() explicite ci-dessous, ce comportement tente de rouvrir une
  // transaction sur une connexion qui en a déjà une active — c'est la cause
  // réelle du crash "beginTransactionAlready" lors des imports (Powens, CSV,
  // catégorisation par lots) : la sérialisation ajoutée précédemment empêche
  // deux transaction() de se chevaucher, mais ne changeait rien à ce conflit
  // interne à un seul transaction(). On désactive donc systématiquement ce
  // comportement : une instruction seule reste atomique de toute façon, et à
  // l'intérieur d'un transaction() explicite, elle doit rejoindre la
  // transaction déjà ouverte plutôt que d'en ouvrir une autre.
  const res = await getDb().run(sql, params as unknown[], false)
  return { lastInsertRowid: res.changes?.lastId ?? 0, changes: res.changes?.changes ?? 0 }
}

export async function exec(sql: string): Promise<void> {
  await getDb().execute(sql)
}

// La connexion SQLite native est unique et partagée : deux beginTransaction()
// concurrents (ex. sync Powens auto au démarrage + sync manuelle) plantent
// avec "beginTransactionAlready". On sérialise donc tous les appels ici.
let txChain: Promise<unknown> = Promise.resolve()

export function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const result = txChain.then(async () => {
    const conn = getDb()
    await conn.beginTransaction()
    try {
      const value = await fn()
      await conn.commitTransaction()
      return value
    } catch (e) {
      await conn.rollbackTransaction()
      throw e
    }
  })
  txChain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

const SCHEMA_SQL = `
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
    currency TEXT DEFAULT 'EUR',
    fx_rate  REAL NOT NULL DEFAULT 1.0,
    balance  REAL
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
    is_internal INTEGER NOT NULL DEFAULT 0,
    note        TEXT,
    tags        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

  CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE(name, parent_id)
  );

  CREATE TABLE IF NOT EXISTS category_rules (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern  TEXT NOT NULL,
    category TEXT NOT NULL,
    source   TEXT NOT NULL DEFAULT 'user',
    priority INTEGER NOT NULL DEFAULT 0,
    internal INTEGER NOT NULL DEFAULT 0,
    UNIQUE(pattern, source)
  );

  CREATE TABLE IF NOT EXISTS rule_packs (
    id           TEXT PRIMARY KEY,
    version      TEXT NOT NULL,
    name         TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    categories   TEXT
  );

  CREATE TABLE IF NOT EXISTS shared_rules (
    pattern   TEXT PRIMARY KEY,
    shared_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS excluded_powens_accounts (
    powens_id  TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
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
    reasoning  TEXT,
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
`

/**
 * Passe category_rules au schéma « packs ». Miroir de migrateCategoryRules()
 * dans src/main/database.ts — voir ce fichier pour le détail du raisonnement.
 */
async function migrateCategoryRules(): Promise<void> {
  const columns = await all<{ name: string }>('PRAGMA table_info(category_rules)')
  if (columns.length === 0 || columns.some((c) => c.name === 'source')) return

  await exec(`
    CREATE TABLE category_rules_migrated (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern  TEXT NOT NULL,
      category TEXT NOT NULL,
      source   TEXT NOT NULL DEFAULT 'user',
      priority INTEGER NOT NULL DEFAULT 0,
      internal INTEGER NOT NULL DEFAULT 0,
      UNIQUE(pattern, source)
    );
    INSERT INTO category_rules_migrated (id, pattern, category, source, priority, internal)
      SELECT id, pattern, category, 'user', ${USER_RULE_PRIORITY}, 0 FROM category_rules;
    DROP TABLE category_rules;
    ALTER TABLE category_rules_migrated RENAME TO category_rules;
  `)

  const rules = await all<{ id: number; category: string }>('SELECT id, category FROM category_rules')
  for (const rule of rules) {
    if (looksLikeInternalCategory(rule.category)) {
      await run('UPDATE category_rules SET internal = 1 WHERE id = ?', [rule.id])
    }
  }

  // Répare les transactions sorties à tort des dépenses par l'ancien test
  // `category.includes('intern')`, qui capturait « Internet / Téléphone ».
  const affected = await all<{ id: number; category: string }>(
    "SELECT id, category FROM transactions WHERE is_internal = 1 AND category IS NOT NULL AND LOWER(category) LIKE '%intern%'"
  )
  for (const tx of affected) {
    if (!looksLikeInternalCategory(tx.category)) {
      await run('UPDATE transactions SET is_internal = 0 WHERE id = ?', [tx.id])
    }
  }
}

/**
 * Ouvre la base et applique le schéma. L'amorçage des catégories est délégué à
 * seedDefaults() (api/rulePacks) : le faire ici créerait un cycle d'import,
 * puisque l'installeur de packs dépend lui-même de ce module.
 *
 * @returns `fresh` à true si la base était vierge, ce qui autorise l'appelant à
 *          installer le pack par défaut.
 */
export async function initDatabase(): Promise<{ fresh: boolean }> {
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result
  db = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await db.open()
  await exec(SCHEMA_SQL)
  await migrateCategoryRules()

  const row = await get<{ n: number }>('SELECT COUNT(*) AS n FROM categories')
  return { fresh: (row?.n ?? 0) === 0 }
}
