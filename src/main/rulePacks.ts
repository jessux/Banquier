import * as db from './database'
import { proxyFetch } from './proxy'
import type { FetchJson } from '../shared/rulePackRegistry'
import {
  buildCatalog,
  DEFAULT_REGISTRY_URL,
  fetchRemoteIndex,
  fetchRemotePack
} from '../shared/rulePackRegistry'
import type { RulePackCatalogResult, RulePackIndexEntry } from '../shared/rulePacks'
import { getBuiltinPack } from '../shared/rulePacks'

/**
 * Passerelle entre le dépôt communautaire de packs et la base locale, côté
 * processus principal. Le mobile a son équivalent dans src/mobile/window-api.ts.
 */

/** Un catalogue de règles n'a aucune raison de peser plus que ça. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

const REQUEST_TIMEOUT_MS = 15_000

const fetchJson: FetchJson = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await proxyFetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`)
    }
    const text = await response.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(`Réponse trop volumineuse (${text.length} octets)`)
    }
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

/** Dernier catalogue distant connu, pour ne pas re-télécharger à l'installation. */
let cachedRemote: RulePackIndexEntry[] = []

export async function getRulePackCatalog(registryUrl = DEFAULT_REGISTRY_URL): Promise<RulePackCatalogResult> {
  const installed = db.getInstalledPacks()
  let remoteError: string | null = null

  try {
    const index = await fetchRemoteIndex(fetchJson, registryUrl)
    cachedRemote = index.packs
  } catch (e) {
    // Hors ligne ou dépôt indisponible : on dégrade sur les packs intégrés
    // plutôt que de laisser la page vide.
    remoteError = (e as Error).message
  }

  return { entries: buildCatalog(cachedRemote, installed), remoteError }
}

export async function installRulePackById(
  packId: string,
  registryUrl = DEFAULT_REGISTRY_URL
): Promise<{ rules: number; categories: number }> {
  const remote = cachedRemote.find((p) => p.id === packId)

  // Le dépôt prime sur la version embarquée : un pack intégré peut y avoir été
  // corrigé depuis la publication du binaire.
  if (remote) {
    const builtin = getBuiltinPack(packId)
    if (!builtin || remote.version !== builtin.version) {
      const pack = await fetchRemotePack(fetchJson, remote, registryUrl)
      return db.installRulePack(pack)
    }
  }

  const builtin = getBuiltinPack(packId)
  if (builtin) return db.installRulePack(builtin)

  throw new Error(`Pack « ${packId} » introuvable dans le catalogue`)
}
