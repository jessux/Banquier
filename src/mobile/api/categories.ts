import { all, get, run, transaction } from '../db'
import type { Category } from '../../shared/types'

export async function getCategoryTree(): Promise<Category[]> {
  return all<Category>('SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name')
}

export async function getCategoryPaths(): Promise<string[]> {
  const allCats = await getCategoryTree()
  const byId = new Map(allCats.map((c) => [c.id, c]))
  return allCats
    .map((c) => {
      if (c.parent_id === null) return c.name
      const parent = byId.get(c.parent_id)
      return parent ? `${parent.name} > ${c.name}` : c.name
    })
    .sort()
}

export async function createCategory(name: string, parentId?: number): Promise<Category> {
  const result = await run('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [
    name.trim(),
    parentId ?? null
  ])
  return get<Category>('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowid]) as Promise<Category>
}

export async function deleteCategory(id: number): Promise<void> {
  await run('DELETE FROM categories WHERE id = ? OR parent_id = ?', [id, id])
}

export async function renameCategory(id: number, name: string): Promise<void> {
  const newName = name.trim()
  const cat = await get<{ name: string; parent_id: number | null }>(
    'SELECT name, parent_id FROM categories WHERE id = ?',
    [id]
  )
  if (!cat) return

  await transaction(async () => {
    if (cat.parent_id === null) {
      const old = cat.name
      await run('UPDATE transactions SET category = ? WHERE category = ?', [newName, old])
      await run('UPDATE category_rules SET category = ? WHERE category = ?', [newName, old])

      const subRows = await all<{ id: number; category: string }>(
        'SELECT id, category FROM transactions WHERE category LIKE ?',
        [old + ' > %']
      )
      for (const row of subRows) {
        await run('UPDATE transactions SET category = ? WHERE id = ?', [
          newName + row.category.slice(old.length),
          row.id
        ])
      }
      const ruleRows = await all<{ id: number; category: string }>(
        'SELECT id, category FROM category_rules WHERE category LIKE ?',
        [old + ' > %']
      )
      for (const row of ruleRows) {
        await run('UPDATE category_rules SET category = ? WHERE id = ?', [
          newName + row.category.slice(old.length),
          row.id
        ])
      }
    } else {
      const parent = await get<{ name: string }>('SELECT name FROM categories WHERE id = ?', [cat.parent_id])
      if (parent) {
        const oldPath = `${parent.name} > ${cat.name}`
        const newPath = `${parent.name} > ${newName}`
        await run('UPDATE transactions SET category = ? WHERE category = ?', [newPath, oldPath])
        await run('UPDATE category_rules SET category = ? WHERE category = ?', [newPath, oldPath])
      }
    }

    await run('UPDATE categories SET name = ? WHERE id = ?', [newName, id])
  })
}

export async function getDistinctCategories(): Promise<string[]> {
  const rows = await all<{ category: string }>(
    'SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL ORDER BY category'
  )
  return rows.map((r) => r.category)
}
