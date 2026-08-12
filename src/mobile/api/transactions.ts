import { all, get, run, transaction } from '../db'
import type { Transaction, TransactionFilters } from '../../shared/types'
import { normalizeMerchant } from '../../shared/merchant'
import { rememberMerchantCategory } from './merchantMemory'

function buildTransactionWhere(filters: TransactionFilters): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.search) {
    conditions.push('t.description LIKE ?')
    params.push(`%${filters.search}%`)
  }
  if (filters.category === '__none__') {
    conditions.push('t.category IS NULL')
  } else if (filters.category) {
    const escaped = filters.category.replace(/[\\%_]/g, '\\$&')
    conditions.push("(t.category = ? OR t.category LIKE ? ESCAPE '\\')")
    params.push(filters.category, `${escaped} > %`)
  }
  if (filters.accountId) {
    conditions.push('t.account_id = ?')
    params.push(filters.accountId)
  }
  if (filters.startDate) {
    conditions.push('t.date >= ?')
    params.push(filters.startDate)
  }
  if (filters.endDate) {
    conditions.push('t.date <= ?')
    params.push(filters.endDate)
  }
  if (filters.minAmount !== undefined) {
    conditions.push('t.amount >= ?')
    params.push(filters.minAmount)
  }
  if (filters.maxAmount !== undefined) {
    conditions.push('t.amount <= ?')
    params.push(filters.maxAmount)
  }
  if (filters.tags) {
    conditions.push('t.tags LIKE ?')
    params.push(`%${filters.tags}%`)
  }
  if (filters.isInternal !== undefined) {
    conditions.push('t.is_internal = ?')
    params.push(filters.isInternal ? 1 : 0)
  }

  return { conditions, params }
}

const SORT_COLS: Record<string, string> = {
  date: 't.date',
  amount: 't.amount',
  description: 't.description',
  category: 't.category'
}

export async function getTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const { conditions, params } = buildTransactionWhere(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const orderCol = SORT_COLS[filters.sortField ?? 'date'] ?? 't.date'
  const orderDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC'
  const orderBy = `ORDER BY ${orderCol} ${orderDir}${orderCol !== 't.date' ? ', t.date DESC' : ''}, t.id DESC`
  const limitClause = filters.limit ? `LIMIT ${filters.limit} OFFSET ${filters.offset ?? 0}` : ''
  const sql = `SELECT t.* FROM transactions t ${where} ${orderBy} ${limitClause}`
  return all<Transaction>(sql, params)
}

export async function countTransactions(filters: TransactionFilters = {}): Promise<number> {
  const { conditions, params } = buildTransactionWhere(filters)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions t ${where}`, params)
  return row?.n ?? 0
}

export async function insertTransactions(
  transactions: Omit<Transaction, 'id'>[],
  importId: number
): Promise<{ imported: number; duplicates: number; insertedIds: number[] }> {
  return transaction(async () => {
    let imported = 0
    let duplicates = 0
    const insertedIds: number[] = []

    for (const row of transactions) {
      const existing = await get(
        'SELECT id FROM transactions WHERE date = ? AND description = ? AND amount = ?',
        [row.date, row.description, row.amount]
      )
      if (existing) {
        duplicates++
      } else {
        const result = await run(
          'INSERT INTO transactions (account_id, date, description, amount, category, import_id, merchant_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            row.account_id ?? null, row.date, row.description, row.amount,
            row.category ?? null, importId, normalizeMerchant(row.description)
          ]
        )
        insertedIds.push(result.lastInsertRowid)
        imported++
      }
    }

    return { imported, duplicates, insertedIds }
  })
}

export async function setTransactionNote(id: number, note: string | null): Promise<void> {
  await run('UPDATE transactions SET note = ? WHERE id = ?', [note || null, id])
}

export async function setTransactionTags(id: number, tags: string | null): Promise<void> {
  await run('UPDATE transactions SET tags = ? WHERE id = ?', [tags || null, id])
}

/** Miroir de updateTransactionCategory() dans src/main/database.ts : la mémoire
 *  agit sur le futur, applyToSimilar sur le passé. */
export async function updateTransactionCategory(
  id: number,
  category: string,
  applyToSimilar = false
): Promise<void> {
  const tx = await get<{ merchant_key: string | null }>(
    'SELECT merchant_key FROM transactions WHERE id = ?',
    [id]
  )

  await run("UPDATE transactions SET category = ?, category_source = 'user' WHERE id = ?", [category, id])
  await rememberMerchantCategory(tx?.merchant_key, category)

  if (applyToSimilar && tx?.merchant_key) {
    await run("UPDATE transactions SET category = ?, category_source = 'user' WHERE merchant_key = ?", [
      category, tx.merchant_key
    ])
  }
}

export async function countTransactionsByPattern(pattern: string): Promise<number> {
  try {
    const regex = new RegExp(pattern, 'i')
    const rows = await all<{ description: string }>('SELECT description FROM transactions')
    return rows.filter((r) => regex.test(r.description)).length
  } catch {
    return 0
  }
}

export async function updateCategoryByPattern(category: string, pattern: string): Promise<number> {
  try {
    const regex = new RegExp(pattern, 'i')
    const rows = await all<{ id: number; description: string; merchant_key: string | null }>(
      'SELECT id, description, merchant_key FROM transactions'
    )
    const matched = rows.filter((r) => regex.test(r.description))
    if (matched.length === 0) return 0
    await transaction(async () => {
      for (const t of matched) {
        await run("UPDATE transactions SET category = ?, category_source = 'rule' WHERE id = ?", [category, t.id])
        await rememberMerchantCategory(t.merchant_key, category)
      }
    })
    return matched.length
  } catch {
    return 0
  }
}

export async function batchUpdateCategories(updates: { id: number; category: string }[]): Promise<void> {
  if (updates.length === 0) return
  await transaction(async () => {
    for (const u of updates) {
      const tx = await get<{ merchant_key: string | null }>(
        'SELECT merchant_key FROM transactions WHERE id = ?',
        [u.id]
      )
      await run("UPDATE transactions SET category = ?, category_source = 'ai' WHERE id = ?", [u.category, u.id])
      await rememberMerchantCategory(tx?.merchant_key, u.category)
    }
  })
}

export async function deleteTransactionsByImport(importId: number): Promise<void> {
  await run('DELETE FROM transactions WHERE import_id = ?', [importId])
  await run('DELETE FROM imports WHERE id = ?', [importId])
}

export async function findDuplicateTransactions(): Promise<Transaction[][]> {
  const groups = await all<{ date: string; amount: number; description: string }>(
    'SELECT date, amount, description FROM transactions GROUP BY date, amount, description HAVING COUNT(*) > 1 ORDER BY date DESC'
  )
  const result: Transaction[][] = []
  for (const g of groups) {
    result.push(
      await all<Transaction>('SELECT * FROM transactions WHERE date = ? AND amount = ? AND description = ? ORDER BY id', [
        g.date,
        g.amount,
        g.description
      ])
    )
  }
  return result
}

/** Miroir de INTERNAL_TRANSFER_MAX_DAYS dans src/main/database.ts. */
const INTERNAL_TRANSFER_MAX_DAYS = 3

/** Miroir de findInternalTransferCandidates() dans src/main/database.ts. */
export async function findInternalTransferCandidates(): Promise<
  { debit: Transaction; credit: Transaction }[]
> {
  const rows = await all<Transaction>(
    `SELECT * FROM transactions
     WHERE is_internal = 0 AND account_id IS NOT NULL
     ORDER BY date`
  )

  const credits = rows.filter((t) => t.amount > 0)
  const pairs: { debit: Transaction; credit: Transaction }[] = []
  const used = new Set<number>()

  for (const debit of rows) {
    if (debit.amount >= 0 || used.has(debit.id)) continue

    const match = credits.find(
      (credit) =>
        !used.has(credit.id) &&
        credit.account_id !== debit.account_id &&
        Math.abs(credit.amount + debit.amount) < 0.005 &&
        Math.abs(Date.parse(credit.date) - Date.parse(debit.date)) <=
          INTERNAL_TRANSFER_MAX_DAYS * 86_400_000
    )
    if (!match) continue

    used.add(debit.id)
    used.add(match.id)
    pairs.push({ debit, credit: match })
  }

  return pairs
}

/** Miroir de markTransactionsInternal() dans src/main/database.ts. */
export async function markTransactionsInternal(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const result = await run(
    `UPDATE transactions SET is_internal = 1 WHERE id IN (${placeholders})`,
    ids
  )
  return result.changes
}

export async function deleteTransaction(id: number): Promise<void> {
  await run('DELETE FROM transactions WHERE id = ?', [id])
}

export async function clearAllTransactions(): Promise<void> {
  await run('DELETE FROM transactions')
  await run('DELETE FROM imports')
}

export async function setTransactionInternal(id: number, isInternal: boolean): Promise<void> {
  await run('UPDATE transactions SET is_internal = ? WHERE id = ?', [isInternal ? 1 : 0, id])
}

export async function setTransactionInternalByCategory(category: string, isInternal: boolean): Promise<number> {
  const escaped = category.replace(/[\\%_]/g, '\\$&')
  const result = await run(
    "UPDATE transactions SET is_internal = ? WHERE (category = ? OR category LIKE ? ESCAPE '\\')",
    [isInternal ? 1 : 0, category, `${escaped} > %`]
  )
  return result.changes
}

export async function getUncategorizedTransactionIds(accountIds: number[]): Promise<number[]> {
  if (accountIds.length === 0) return []
  const placeholders = accountIds.map(() => '?').join(',')
  const rows = await all<{ id: number }>(
    `SELECT id FROM transactions WHERE category IS NULL AND account_id IN (${placeholders})`,
    accountIds
  )
  return rows.map((r) => r.id)
}

export async function getLatestPowensTransactionDate(): Promise<string | null> {
  const row = await get<{ d: string | null }>(
    `SELECT MAX(t.date) AS d FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE a.bank LIKE 'powens:%'`
  )
  return row?.d ?? null
}
