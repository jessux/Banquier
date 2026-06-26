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
  StoredChatMessage,
  MerchantStats,
  PeriodComparison,
  PeriodComparisonRow,
  UncategorizedSummary,
  NetBalance,
  RecurringFrequency,
  RecurringExpense,
  RecurringSummary,
  BankConnection
} from '../shared/types'

let db: Database

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'banquier.db')
  db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  createTables()
  migrate()
  seedCategories()
}

function migrate(): void {
  try {
    db.exec('ALTER TABLE transactions ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0')
  } catch {
    // column already exists
  }
}

function createTables(): void {
  db.exec(`
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
      import_id   INTEGER REFERENCES imports(id)
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

    CREATE TABLE IF NOT EXISTS bank_connections (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      gc_account_id    TEXT NOT NULL UNIQUE,
      account_id       INTEGER REFERENCES accounts(id),
      institution_name TEXT,
      iban_tail        TEXT,
      requisition_id   TEXT,
      created_at       TEXT NOT NULL,
      last_sync        TEXT
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

// --- Transactions ---

export function getTransactions(filters: TransactionFilters = {}): Transaction[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.search) { conditions.push('t.description LIKE ?'); params.push(`%${filters.search}%`) }
  if (filters.category === '__none__') { conditions.push('t.category IS NULL') }
  else if (filters.category) { conditions.push('t.category = ?'); params.push(filters.category) }
  if (filters.accountId) { conditions.push('t.account_id = ?'); params.push(filters.accountId) }
  if (filters.startDate) { conditions.push('t.date >= ?'); params.push(filters.startDate) }
  if (filters.endDate) { conditions.push('t.date <= ?'); params.push(filters.endDate) }
  if (filters.minAmount !== undefined) { conditions.push('t.amount >= ?'); params.push(filters.minAmount) }
  if (filters.maxAmount !== undefined) { conditions.push('t.amount <= ?'); params.push(filters.maxAmount) }
  if (filters.isInternal !== undefined) { conditions.push('t.is_internal = ?'); params.push(filters.isInternal ? 1 : 0) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitClause = filters.limit ? `LIMIT ${Math.min(filters.limit, 500)}` : ''
  const sql = `SELECT t.* FROM transactions t ${where} ORDER BY t.date DESC, t.id DESC ${limitClause}`
  return db.all(sql, params) as Transaction[]
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
          'INSERT INTO transactions (account_id, date, description, amount, category, import_id) VALUES (?, ?, ?, ?, ?, ?)',
          [row.account_id ?? null, row.date, row.description, row.amount, row.category ?? null, importId]
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

export function updateTransactionCategory(id: number, category: string, applyToSimilar = false): void {
  db.run('UPDATE transactions SET category = ? WHERE id = ?', [category, id])
  if (applyToSimilar) {
    const tx = db.get('SELECT description FROM transactions WHERE id = ?', [id]) as { description: string } | undefined
    if (tx?.description) {
      db.run('UPDATE transactions SET category = ? WHERE description = ?', [category, tx.description])
    }
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
    const rows = db.all('SELECT id, description FROM transactions') as { id: number; description: string }[]
    const matched = rows.filter((r) => regex.test(r.description))
    if (matched.length === 0) return 0
    db.exec('BEGIN')
    try {
      for (const t of matched) {
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [category, t.id])
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

export function batchUpdateCategories(updates: { id: number; category: string }[]): void {
  if (updates.length === 0) return
  db.exec('BEGIN')
  try {
    for (const u of updates) {
      db.run('UPDATE transactions SET category = ? WHERE id = ?', [u.category, u.id])
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

// --- Open banking (connexions de comptes bancaires) ---

export function getBankConnections(): BankConnection[] {
  return db.all('SELECT * FROM bank_connections ORDER BY created_at DESC') as BankConnection[]
}

export function getBankConnectionByGcId(gcAccountId: string): BankConnection | undefined {
  return db.get('SELECT * FROM bank_connections WHERE gc_account_id = ?', [gcAccountId]) as
    | BankConnection
    | undefined
}

export function upsertBankConnection(conn: {
  gcAccountId: string
  accountId: number
  institutionName: string | null
  ibanTail: string | null
  requisitionId: string
}): void {
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO bank_connections (gc_account_id, account_id, institution_name, iban_tail, requisition_id, created_at, last_sync)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(gc_account_id) DO UPDATE SET
       account_id = excluded.account_id,
       institution_name = excluded.institution_name,
       iban_tail = excluded.iban_tail,
       requisition_id = excluded.requisition_id,
       last_sync = excluded.last_sync`,
    [conn.gcAccountId, conn.accountId, conn.institutionName, conn.ibanTail, conn.requisitionId, now, now]
  )
}

export function touchBankConnectionSync(gcAccountId: string): void {
  db.run('UPDATE bank_connections SET last_sync = ? WHERE gc_account_id = ?', [
    new Date().toISOString(),
    gcAccountId
  ])
}

// --- Stats ---

export function getMonthlyStats(months = 6, anchorEnd?: string): MonthlyStats[] {
  // Fenêtre de `months` mois calendaires se terminant au mois de `anchorEnd`
  // (par défaut le mois courant). Permet de décaler la tendance selon le filtre.
  const anchor = anchorEnd ?? new Date().toISOString().slice(0, 10)
  return db.all(
    `SELECT
      strftime('%Y-%m', date) AS month,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_debit,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_credit
    FROM transactions
    WHERE date >= date(?, 'start of month', '-' || ? || ' months')
      AND date <= date(?, 'start of month', '+1 month', '-1 day')
      AND is_internal = 0
    GROUP BY month
    ORDER BY month ASC`,
    [anchor, months - 1, anchor]
  ) as MonthlyStats[]
}

export function getCategoryStats(startDate?: string, endDate?: string, excludeCategories?: string[]): CategoryStats[] {
  const conditions: string[] = ['amount < 0', 'is_internal = 0']
  const params: unknown[] = []

  if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('date <= ?'); params.push(endDate) }
  if (excludeCategories?.length) {
    conditions.push(`(category IS NULL OR category NOT IN (${excludeCategories.map(() => '?').join(',')}))`)
    params.push(...excludeCategories)
  }

  return db.all(
    `SELECT
      COALESCE(category, 'Non catégorisé') AS category,
      SUM(ABS(amount)) AS total,
      COUNT(*) AS count
    FROM transactions
    WHERE ${conditions.join(' AND ')}
    GROUP BY category
    ORDER BY total DESC`,
    params
  ) as CategoryStats[]
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

export function getDashboardSummary(startDate?: string, endDate?: string, excludeCategories?: string[]): DashboardSummary {
  const today = new Date()
  const effectiveEnd = endDate ?? today.toISOString().slice(0, 10)

  let effectiveStart: string
  let prevStart: string
  let prevEnd: string

  const exclClause = excludeCategories?.length
    ? `AND (category IS NULL OR category NOT IN (${excludeCategories.map(() => '?').join(',')}))`
    : ''
  const exclParams: unknown[] = excludeCategories?.length ? excludeCategories : []

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
      `SELECT MIN(date) AS d FROM transactions WHERE is_internal = 0 ${exclClause}`,
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
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_debit,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_credit
      FROM transactions WHERE date >= ? AND date <= ? AND is_internal = 0 ${exclClause}`,
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
    monthlyTrend: getMonthlyStats(trendMonths, trendAnchor),
    trendHighlightStart,
    trendHighlightEnd
  }
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
      db.run('UPDATE transactions SET category = ? WHERE category = ?', [newName, old])
      db.run('UPDATE category_rules SET category = ? WHERE category = ?', [newName, old])

      const subRows = db.all(
        "SELECT id, category FROM transactions WHERE category LIKE ?",
        [old + ' > %']
      ) as { id: number; category: string }[]
      for (const row of subRows) {
        db.run('UPDATE transactions SET category = ? WHERE id = ?', [
          newName + row.category.slice(old.length), row.id
        ])
      }
      const ruleRows = db.all(
        "SELECT id, category FROM category_rules WHERE category LIKE ?",
        [old + ' > %']
      ) as { id: number; category: string }[]
      for (const row of ruleRows) {
        db.run('UPDATE category_rules SET category = ? WHERE id = ?', [
          newName + row.category.slice(old.length), row.id
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
  const result = db.run(
    'UPDATE transactions SET is_internal = ? WHERE category = ?',
    [isInternal ? 1 : 0, category]
  )
  return result.changes as number
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

export function exportDb(destPath: string): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  fs.copyFileSync(path.join(app.getPath('userData'), 'banquier.db'), destPath)
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

const MERCHANT_NOISE =
  /\b(CB|CARTE|PAIEMENT|PAIMT|ACHAT|RETRAIT|DU|LE|FACTURE|FACT|PRLV|PRELEVEMENT|PRELVT|VIR|VIREMENT|SEPA|REF|MANDAT|ID|EUR)\b/g

function normalizeMerchant(desc: string): string {
  const cleaned = desc
    .toUpperCase()
    .replace(/[0-9]+([./-][0-9]+)*/g, ' ') // dates, montants, références numériques
    .replace(MERCHANT_NOISE, ' ')
    .replace(/[^A-ZÀ-Ü ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')
  return cleaned || desc.trim().slice(0, 30).toUpperCase()
}

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
  const conditions = ['is_internal = 0']
  const params: unknown[] = []
  if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('date <= ?'); params.push(endDate) }

  const row = db.get(
    `SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_credit,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_debit
    FROM transactions WHERE ${conditions.join(' AND ')}`,
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
  const conditions = ['amount < 0', 'is_internal = 0']
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
  ) as { id: number; thread_id: number; role: string; content: string; tool_calls: string | null; created_at: string }[]
  return rows.map((r) => ({
    id: r.id,
    thread_id: r.thread_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    toolCalls: parseToolCalls(r.tool_calls),
    created_at: r.created_at
  }))
}

export function addChatMessage(
  threadId: number,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: string[]
): void {
  const now = new Date().toISOString()
  db.run(
    'INSERT INTO chat_messages (thread_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?)',
    [threadId, role, content, toolCalls?.length ? JSON.stringify(toolCalls) : null, now]
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
