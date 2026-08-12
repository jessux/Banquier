import { all, get, run, transaction } from '../db'
import { applyRulesToTransactions } from './rules'
import { getCategoryPaths } from './categories'
import { lookupMerchantDictionary } from '../../shared/merchantDictionary'
import { findFuzzyCategory, type RememberedMerchant } from '../../shared/categorization'

/**
 * Mémoire de catégorisation par marchand — miroir de la section « Mémoire
 * marchand » de src/main/database.ts. Voir ce fichier pour le raisonnement.
 */

export async function rememberMerchantCategory(
  merchantKey: string | null | undefined,
  category: string
): Promise<void> {
  const key = (merchantKey ?? '').trim()
  const cat = category.trim()
  if (!key || !cat) return

  await run(
    `INSERT INTO merchant_categories (merchant_key, category, count, last_used)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(merchant_key) DO UPDATE SET
       category  = excluded.category,
       count     = merchant_categories.count + 1,
       last_used = excluded.last_used`,
    [key, cat, new Date().toISOString()]
  )
}

/** Mémorise la décision prise pour une transaction, via sa clé marchand. */
export async function rememberCategoryForTransaction(
  transactionId: number,
  category: string
): Promise<void> {
  const tx = await get<{ merchant_key: string | null }>(
    'SELECT merchant_key FROM transactions WHERE id = ?',
    [transactionId]
  )
  await rememberMerchantCategory(tx?.merchant_key, category)
}

export async function applyMerchantMemory(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0

  const CHUNK = 200
  let updated = 0

  await transaction(async () => {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = await all<{ id: number; category: string }>(
        `SELECT t.id, m.category
         FROM transactions t
         JOIN merchant_categories m ON m.merchant_key = t.merchant_key
         WHERE t.id IN (${placeholders}) AND t.category IS NULL`,
        chunk
      )

      for (const row of rows) {
        await run('UPDATE transactions SET category = ? WHERE id = ?', [row.category, row.id])
        if (row.category.toLowerCase().includes('intern')) {
          await run('UPDATE transactions SET is_internal = 1 WHERE id = ?', [row.id])
        }
        updated++
      }
    }
  })

  return updated
}

/** Miroir de applyFuzzyMerchantMemory() dans src/main/database.ts. */
export async function applyFuzzyMerchantMemory(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0

  const memory = await all<RememberedMerchant>(
    'SELECT merchant_key, category, count FROM merchant_categories'
  )
  if (memory.length === 0) return 0

  const CHUNK = 200
  let updated = 0

  await transaction(async () => {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = await all<{ id: number; merchant_key: string }>(
        `SELECT id, merchant_key FROM transactions
         WHERE id IN (${placeholders}) AND category IS NULL AND merchant_key IS NOT NULL`,
        chunk
      )

      for (const row of rows) {
        const category = findFuzzyCategory(row.merchant_key, memory)
        if (!category) continue
        await run('UPDATE transactions SET category = ? WHERE id = ?', [category, row.id])
        updated++
      }
    }
  })

  return updated
}

/** Miroir de applyMerchantDictionary() dans src/main/database.ts. */
export async function applyMerchantDictionary(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0

  const known = new Set(await getCategoryPaths())
  const CHUNK = 200
  let updated = 0

  await transaction(async () => {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = await all<{ id: number; merchant_key: string; amount: number }>(
        `SELECT id, merchant_key, amount FROM transactions
         WHERE id IN (${placeholders}) AND category IS NULL AND merchant_key IS NOT NULL`,
        chunk
      )

      for (const row of rows) {
        const proposed = lookupMerchantDictionary(row.merchant_key, row.amount)
        if (!proposed) continue
        const category = resolveKnownCategory(proposed, known)
        if (!category) continue
        await run('UPDATE transactions SET category = ? WHERE id = ?', [category, row.id])
        updated++
      }
    }
  })

  return updated
}

/** Miroir de resolveKnownCategory() dans src/main/database.ts. */
function resolveKnownCategory(category: string, known: Set<string>): string | null {
  if (known.has(category)) return category
  const sep = category.indexOf(' > ')
  if (sep !== -1) {
    const parent = category.slice(0, sep)
    if (known.has(parent)) return parent
  }
  return null
}

/** Miroir de autoCategorize() dans src/main/database.ts. */
export async function autoCategorize(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0
  const byRules = await applyRulesToTransactions(transactionIds)
  const byMemory = await applyMerchantMemory(transactionIds)
  const byFuzzy = await applyFuzzyMerchantMemory(transactionIds)
  const byDictionary = await applyMerchantDictionary(transactionIds)
  return byRules + byMemory + byFuzzy + byDictionary
}
