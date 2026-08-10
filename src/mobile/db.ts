import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

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
    pattern  TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL
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

async function seedCategories(): Promise<void> {
  const row = await get<{ n: number }>('SELECT COUNT(*) AS n FROM categories')
  if ((row?.n ?? 0) > 0) return
  for (const cat of DEFAULT_CATEGORY_TREE) {
    try {
      const result = await run('INSERT INTO categories (name, parent_id) VALUES (?, NULL)', [cat.name])
      const parentId = result.lastInsertRowid
      for (const child of cat.children ?? []) {
        try {
          await run('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [child, parentId])
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }
}

export async function initDatabase(): Promise<void> {
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result
  db = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await db.open()
  await exec(SCHEMA_SQL)
  await seedCategories()
}
