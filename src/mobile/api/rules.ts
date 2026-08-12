import { all, run, transaction } from '../db'

export async function upsertCategoryRule(pattern: string, category: string): Promise<void> {
  await run(
    'INSERT INTO category_rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category',
    [pattern, category]
  )
}

export async function getCategoryRules(): Promise<{ pattern: string; category: string }[]> {
  return all<{ pattern: string; category: string }>('SELECT pattern, category FROM category_rules ORDER BY id')
}

export async function getCategoryRulesWithId(): Promise<{ id: number; pattern: string; category: string }[]> {
  return all<{ id: number; pattern: string; category: string }>(
    'SELECT id, pattern, category FROM category_rules ORDER BY id'
  )
}

export async function deleteCategoryRule(id: number): Promise<void> {
  await run('DELETE FROM category_rules WHERE id = ?', [id])
}

export async function updateCategoryRule(id: number, pattern: string, category: string): Promise<void> {
  await run('UPDATE category_rules SET pattern = ?, category = ? WHERE id = ?', [pattern, category, id])
}

export async function applyRulesToTransactions(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0
  const rules = await getCategoryRules()
  if (rules.length === 0) return 0

  const compiled = rules
    .map((r) => {
      try {
        return { regex: new RegExp(r.pattern, 'i'), category: r.category }
      } catch {
        return null
      }
    })
    .filter(Boolean) as { regex: RegExp; category: string }[]
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
            if (rule.category.toLowerCase().includes('intern')) {
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
