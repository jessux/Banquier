import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { normalizeMerchant } from '../shared/merchant'

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

/** Nombre d'instructions par lot natif. `executeSet` accepte un tableau
 *  arbitraire, mais des lots trop gros risquent de saturer le pont Capacitor
 *  sur un très gros historique — on chunke par prudence. */
const BATCH_CHUNK = 300

/**
 * Exécute un lot d'instructions en un seul aller-retour natif, au lieu d'un
 * `run()` par ligne.
 *
 * Chaque `run()` traverse le pont JS↔natif Capacitor : sur desktop (SQLite en
 * process, via node-sqlite3-wasm) une boucle de milliers d'appels est quasi
 * instantanée, mais sur mobile chaque aller-retour coûte plusieurs
 * millisecondes. Une migration qui parcourt tout l'historique de transactions
 * ligne par ligne peut ainsi prendre des dizaines de secondes à plusieurs
 * minutes — bloquant l'affichage puisque `initDatabase()` est attendu avant le
 * montage de React (voir `installMobileApi` / `main.tsx`).
 */
async function runBatch(statements: { statement: string; values: unknown[] }[]): Promise<void> {
  if (statements.length === 0) return
  await transaction(async () => {
    for (let offset = 0; offset < statements.length; offset += BATCH_CHUNK) {
      const chunk = statements.slice(offset, offset + BATCH_CHUNK)
      // `transaction: false` : le lot rejoint la transaction déjà ouverte par
      // transaction() ci-dessus, pour la même raison que run() (voir plus haut).
      await getDb().executeSet(chunk, false)
    }
  })
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
    tags        TEXT,
    -- Libellé réduit au marchand (voir shared/merchant.ts) : clé de
    -- regroupement pour la mémoire de catégorisation et la dédup LLM.
    merchant_key TEXT,
    -- Qui a posé la catégorie (voir CategorySource).
    category_source TEXT
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

  -- Mémoire de catégorisation : voir src/main/database.ts.
  CREATE TABLE IF NOT EXISTS merchant_categories (
    merchant_key TEXT PRIMARY KEY,
    category     TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 1,
    last_used    TEXT NOT NULL
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

/**
 * Défait la migration introduite par les packs de règles (1.33.0), retirés
 * depuis. Miroir de rollbackRulePacksSchema() dans src/main/database.ts — voir
 * ce fichier pour le détail.
 */
async function rollbackRulePacksSchema(): Promise<void> {
  const columns = await all<{ name: string }>('PRAGMA table_info(category_rules)')
  if (!columns.some((c) => c.name === 'source')) return

  await exec(`
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
}

/** Miroir de migrate() dans src/main/database.ts. */
async function migrate(): Promise<void> {
  const migrations = [
    'ALTER TABLE transactions ADD COLUMN merchant_key TEXT',
    'CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_key)',
    'ALTER TABLE transactions ADD COLUMN category_source TEXT'
  ]
  for (const sql of migrations) {
    try { await exec(sql) } catch { /* colonne déjà présente */ }
  }
  await backfillMerchantKeys()
}

/** Miroir de backfillMerchantKeys() dans src/main/database.ts — en lot plutôt
 *  qu'un UPDATE par ligne (voir runBatch), le premier lancement après mise à
 *  jour parcourant potentiellement tout l'historique de transactions. */
async function backfillMerchantKeys(): Promise<void> {
  const rows = await all<{ id: number; description: string }>(
    'SELECT id, description FROM transactions WHERE merchant_key IS NULL'
  )
  if (rows.length === 0) return

  await runBatch(
    rows.map((row) => ({
      statement: 'UPDATE transactions SET merchant_key = ? WHERE id = ?',
      values: [normalizeMerchant(row.description), row.id]
    }))
  )
}

/** Miroir de bootstrapMerchantMemory() dans src/main/database.ts. */
async function bootstrapMerchantMemory(): Promise<void> {
  const rows = await all<{ merchant_key: string; category: string; n: number; last_date: string }>(
    `SELECT merchant_key, category, COUNT(*) AS n, MAX(date) AS last_date
     FROM transactions
     WHERE category IS NOT NULL AND category <> '' AND merchant_key IS NOT NULL AND merchant_key <> ''
     GROUP BY merchant_key, category`
  )
  if (rows.length === 0) return

  const best = new Map<string, { category: string; n: number; last_date: string }>()
  for (const row of rows) {
    const current = best.get(row.merchant_key)
    const wins =
      !current || row.n > current.n || (row.n === current.n && row.last_date > current.last_date)
    if (wins) best.set(row.merchant_key, row)
  }

  await runBatch(
    Array.from(best.entries()).map(([key, entry]) => ({
      statement: `INSERT INTO merchant_categories (merchant_key, category, count, last_used)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(merchant_key) DO NOTHING`,
      values: [key, entry.category, entry.n, entry.last_date]
    }))
  )
}

async function tableExists(name: string): Promise<boolean> {
  const row = await get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", [name])
  return row != null
}

export async function initDatabase(): Promise<void> {
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result
  db = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await db.open()
  // Relevé avant la création des tables : la mémoire ne s'amorce qu'une fois.
  const memoryWasMissing = !(await tableExists('merchant_categories'))
  await exec(SCHEMA_SQL)
  await rollbackRulePacksSchema()
  await migrate()
  await seedCategories()
  if (memoryWasMissing) await bootstrapMerchantMemory()
}
