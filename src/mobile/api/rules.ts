import { all, run, transaction } from '../db'
import type { CategoryRule } from '../../shared/types'
import { looksLikeInternalCategory, USER_RULE_PRIORITY } from '../../shared/rulePacks'

/**
 * L'ordre EST la priorité : applyRulesToTransactions s'arrête à la première
 * règle qui correspond. `priority` d'abord (les règles utilisateur sont à 0 et
 * gagnent donc toujours face aux packs), puis `id` pour rester déterministe.
 */
const RULE_ORDER = 'ORDER BY priority, id'

export async function upsertCategoryRule(pattern: string, category: string): Promise<void> {
  await run(
    `INSERT INTO category_rules (pattern, category, source, priority, internal)
     VALUES (?, ?, 'user', ?, ?)
     ON CONFLICT(pattern, source) DO UPDATE SET category = excluded.category, internal = excluded.internal`,
    [pattern, category, USER_RULE_PRIORITY, looksLikeInternalCategory(category) ? 1 : 0]
  )
}

export async function getCategoryRules(): Promise<{ pattern: string; category: string; internal: number }[]> {
  return all<{ pattern: string; category: string; internal: number }>(
    `SELECT pattern, category, internal FROM category_rules ${RULE_ORDER}`
  )
}

export async function getCategoryRulesWithId(): Promise<CategoryRule[]> {
  return all<CategoryRule>(
    `SELECT id, pattern, category, source, priority, internal FROM category_rules ${RULE_ORDER}`
  )
}

export async function deleteCategoryRule(id: number): Promise<void> {
  await run('DELETE FROM category_rules WHERE id = ?', [id])
}

export async function updateCategoryRule(id: number, pattern: string, category: string): Promise<void> {
  // Éditer une règle de pack la détache : elle devient une règle utilisateur,
  // sinon la prochaine mise à jour du pack écraserait la modification.
  await run(
    `UPDATE category_rules
        SET pattern = ?, category = ?, source = 'user', priority = ?, internal = ?
      WHERE id = ?`,
    [pattern, category, USER_RULE_PRIORITY, looksLikeInternalCategory(category) ? 1 : 0, id]
  )
}

export async function applyRulesToTransactions(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0
  const rules = await getCategoryRules()
  if (rules.length === 0) return 0

  const compiled = rules
    .map((r) => {
      try {
        return { regex: new RegExp(r.pattern, 'i'), category: r.category, internal: r.internal === 1 }
      } catch {
        return null
      }
    })
    .filter(Boolean) as { regex: RegExp; category: string; internal: boolean }[]
  if (compiled.length === 0) return 0

  const CHUNK = 200
  let updated = 0

  await transaction(async () => {
    for (let offset = 0; offset < transactionIds.length; offset += CHUNK) {
      const chunk = transactionIds.slice(offset, offset + CHUNK)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = await all<{ id: number; description: string }>(
        `SELECT id, description FROM transactions WHERE id IN (${placeholders})`,
        chunk
      )

      for (const tx of rows) {
        for (const rule of compiled) {
          if (rule.regex.test(tx.description)) {
            await run('UPDATE transactions SET category = ? WHERE id = ?', [rule.category, tx.id])
            if (rule.internal) {
              await run('UPDATE transactions SET is_internal = 1 WHERE id = ?', [tx.id])
            }
            updated++
            break
          }
        }
      }
    }
  })

  return updated
}
