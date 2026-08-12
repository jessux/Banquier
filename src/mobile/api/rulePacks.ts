import { all, get, run, transaction } from '../db'
import type { InstalledPack, RulePack } from '../../shared/rulePacks'
import {
  categoryPathsOfPack,
  DEFAULT_CATEGORY_TREE,
  FR_BASE_PACK,
  getBuiltinPack,
  looksLikeInternalCategory,
  packSource
} from '../../shared/rulePacks'
import type { SharePartition } from '../../shared/ruleSharing'
import { partitionForSharing } from '../../shared/ruleSharing'
import { getCategoryRulesWithId } from './rules'

/**
 * Gestion des packs de règles côté mobile. Miroir de la section « Rule packs »
 * de src/main/database.ts — toute évolution doit être appliquée aux deux.
 */

/**
 * Amorce une base vierge avec le pack fr-base complet (catégories ET règles),
 * pour que le premier import arrive déjà catégorisé. Sur une base existante,
 * installer des règles d'office recatégoriserait sans demande de l'utilisateur :
 * le pack lui est alors simplement proposé dans la page Packs.
 */
export async function seedDefaults(fresh: boolean): Promise<void> {
  if (!fresh) return
  try {
    await installRulePack(FR_BASE_PACK)
  } catch {
    // Un pack cassé ne doit pas empêcher l'app de démarrer.
    for (const cat of DEFAULT_CATEGORY_TREE) {
      try {
        const created = await run('INSERT INTO categories (name, parent_id) VALUES (?, NULL)', [cat.name])
        for (const child of cat.children ?? []) {
          try {
            await run('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [child, created.lastInsertRowid])
          } catch {
            /* skip */
          }
        }
      } catch {
        /* skip */
      }
    }
  }
}

export async function getInstalledPacks(): Promise<InstalledPack[]> {
  return all<InstalledPack>(
    `SELECT p.id, p.version, p.name, p.installed_at,
            (SELECT COUNT(*) FROM category_rules r WHERE r.source = 'pack:' || p.id) AS rule_count
       FROM rule_packs p ORDER BY p.name`
  )
}

export async function installRulePack(pack: RulePack): Promise<{ rules: number; categories: number }> {
  const source = packSource(pack.id)
  let categories = 0

  await transaction(async () => {
    for (const cat of pack.categories) {
      const existing = await get<{ id: number }>(
        'SELECT id FROM categories WHERE name = ? AND parent_id IS NULL',
        [cat.name]
      )
      let parentId = existing?.id
      if (!parentId) {
        const created = await run('INSERT INTO categories (name, parent_id) VALUES (?, NULL)', [cat.name])
        parentId = created.lastInsertRowid
        categories++
      }
      for (const child of cat.children ?? []) {
        const found = await get<{ id: number }>(
          'SELECT id FROM categories WHERE name = ? AND parent_id = ?',
          [child, parentId]
        )
        if (!found) {
          await run('INSERT INTO categories (name, parent_id) VALUES (?, ?)', [child, parentId])
          categories++
        }
      }
    }

    await run('DELETE FROM category_rules WHERE source = ?', [source])
    for (let index = 0; index < pack.rules.length; index++) {
      const rule = pack.rules[index]
      await run(
        'INSERT INTO category_rules (pattern, category, source, priority, internal) VALUES (?, ?, ?, ?, ?)',
        [
          rule.pattern,
          rule.category,
          source,
          // L'ordre du tableau `rules` est la priorité interne du pack.
          pack.priority * 1000 + index,
          rule.internal || looksLikeInternalCategory(rule.category) ? 1 : 0
        ]
      )
    }

    await run(
      `INSERT INTO rule_packs (id, version, name, installed_at, categories) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version, name = excluded.name,
         installed_at = excluded.installed_at, categories = excluded.categories`,
      [
        pack.id,
        pack.version,
        pack.name,
        new Date().toISOString(),
        JSON.stringify(categoryPathsOfPack(pack))
      ]
    )
  })

  return { rules: pack.rules.length, categories }
}

// --- File de partage communautaire ---

/**
 * Catégories provenant des packs installés — le seul référentiel « public ».
 * Voir getPackCategoryPaths() dans src/main/database.ts : se servir de l'arbre
 * complet de l'utilisateur vidait le garde-fou de son sens.
 */
export async function getPackCategoryPaths(): Promise<string[]> {
  const rows = await all<{ id: string; categories: string | null }>(
    'SELECT id, categories FROM rule_packs'
  )
  const paths = new Set<string>()

  for (const row of rows) {
    if (row.categories) {
      try {
        for (const path of JSON.parse(row.categories) as string[]) paths.add(path)
        continue
      } catch { /* JSON corrompu : on retombe sur le pack intégré */ }
    }
    const builtin = getBuiltinPack(row.id)
    if (builtin) for (const path of categoryPathsOfPack(builtin)) paths.add(path)
  }

  return [...paths]
}

export async function getSharePartition(): Promise<SharePartition> {
  const rules = await getCategoryRulesWithId()
  const known = new Set(await getPackCategoryPaths())
  const shared = new Set((await all<{ pattern: string }>('SELECT pattern FROM shared_rules')).map((r) => r.pattern))
  return partitionForSharing(rules, known, shared)
}

export async function markRulesShared(patterns: string[]): Promise<void> {
  const now = new Date().toISOString()
  for (const pattern of patterns) {
    await run(
      'INSERT INTO shared_rules (pattern, shared_at) VALUES (?, ?) ON CONFLICT(pattern) DO NOTHING',
      [pattern, now]
    )
  }
}

/** Retire les règles d'un pack en conservant les catégories créées : des
 *  transactions y sont probablement déjà rattachées. */
export async function uninstallRulePack(packId: string): Promise<number> {
  const result = await run('DELETE FROM category_rules WHERE source = ?', [packSource(packId)])
  await run('DELETE FROM rule_packs WHERE id = ?', [packId])
  return result.changes
}
