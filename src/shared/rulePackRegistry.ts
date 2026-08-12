import type { InstalledPack, PackCatalogEntry, RulePack, RulePackIndex, RulePackIndexEntry } from './rulePacks'
import { BUILTIN_PACKS, compareVersions, rulePackIndexSchema, validatePack } from './rulePacks'

/**
 * Accès au dépôt communautaire de packs.
 *
 * Le réseau est injecté (`FetchJson`) parce que les deux runtimes n'ont pas le
 * même client HTTP : le processus principal doit passer par proxyFetch() pour
 * traverser les proxies d'entreprise, le mobile utilise le fetch natif.
 */

/** Catalogue par défaut. Servi en brut depuis la branche principale du dépôt. */
export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/jessux/banquier-rules/main/index.json'

export type FetchJson = (url: string) => Promise<unknown>

/** Empêche un catalogue anormalement gros de bloquer l'interface. */
const MAX_PACKS_IN_INDEX = 200

export async function fetchRemoteIndex(
  fetchJson: FetchJson,
  registryUrl: string = DEFAULT_REGISTRY_URL
): Promise<RulePackIndex> {
  const raw = await fetchJson(registryUrl)
  const parsed = rulePackIndexSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Catalogue illisible : ${parsed.error.issues[0]?.message ?? 'format inattendu'}`)
  }
  if (parsed.data.packs.length > MAX_PACKS_IN_INDEX) {
    throw new Error(`Catalogue trop volumineux (${parsed.data.packs.length} packs)`)
  }
  return parsed.data
}

/**
 * Télécharge et valide un pack distant.
 *
 * La validation n'est pas une formalité : elle rejette notamment les regex à
 * quantificateur imbriqué, qui figeraient l'application au moment d'appliquer
 * les règles. Un pack non valide n'est jamais installé.
 */
export async function fetchRemotePack(
  fetchJson: FetchJson,
  entry: Pick<RulePackIndexEntry, 'id' | 'path'>,
  registryUrl: string = DEFAULT_REGISTRY_URL
): Promise<RulePack> {
  const url = new URL(entry.path, registryUrl).toString()
  const raw = await fetchJson(url)
  const result = validatePack(raw)

  if (!result.valid || !result.pack) {
    throw new Error(`Pack « ${entry.id} » invalide :\n- ${result.errors.slice(0, 5).join('\n- ')}`)
  }
  if (result.pack.id !== entry.id) {
    // Un pack qui ne porte pas l'id annoncé écraserait les règles d'un autre.
    throw new Error(`Pack « ${entry.id} » incohérent : le fichier déclare l'id « ${result.pack.id} »`)
  }
  return result.pack
}

/**
 * Fusionne packs intégrés, catalogue distant et état local en une seule liste
 * pour l'interface. Les packs intégrés apparaissent même hors ligne.
 */
export function buildCatalog(
  remote: RulePackIndexEntry[],
  installed: InstalledPack[]
): PackCatalogEntry[] {
  const installedById = new Map(installed.map((p) => [p.id, p]))
  const byId = new Map<string, PackCatalogEntry>()

  for (const pack of BUILTIN_PACKS) {
    byId.set(pack.id, {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      locale: pack.locale,
      version: pack.version,
      ruleCount: pack.rules.length,
      installedVersion: installedById.get(pack.id)?.version ?? null,
      builtin: true
    })
  }

  for (const entry of remote) {
    const builtin = byId.get(entry.id)
    // Le dépôt fait autorité sur la version : un pack intégré peut y avoir une
    // version plus récente que celle embarquée dans le binaire.
    if (builtin && compareVersions(entry.version, builtin.version) <= 0) continue
    byId.set(entry.id, {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      locale: entry.locale,
      version: entry.version,
      ruleCount: entry.ruleCount,
      installedVersion: installedById.get(entry.id)?.version ?? null,
      builtin: builtin?.builtin ?? false
    })
  }

  // Packs installés absents du catalogue (dépôt injoignable, pack retiré) :
  // ils doivent rester visibles, ne serait-ce que pour être désinstallés.
  for (const pack of installed) {
    if (!byId.has(pack.id)) {
      byId.set(pack.id, {
        id: pack.id,
        name: pack.name,
        description: '',
        locale: '',
        version: pack.version,
        ruleCount: pack.rule_count,
        installedVersion: pack.version,
        builtin: false
      })
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** true si une version plus récente que celle installée est disponible. */
export function hasUpdate(entry: PackCatalogEntry): boolean {
  return entry.installedVersion !== null && compareVersions(entry.version, entry.installedVersion) > 0
}
