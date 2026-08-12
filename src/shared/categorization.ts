import type { Transaction } from './types'
import { normalizeMerchant } from './merchant'

/**
 * Au-dessus de cette confiance, une proposition IA est tenue pour sûre : elle
 * est pré-cochée dans la revue, et appliquée d'office en mode automatique.
 */
export const AUTO_ACCEPT_CONFIDENCE = 0.8

/**
 * Sous ce seuil, une proposition issue du batch initial (sans recherche web
 * dédiée, une requête sur tout le lot à la fois n'ayant pas de sujet assez
 * précis) est jugée trop incertaine : le marchand repasse au LLM seul, avec
 * une recherche web ciblée cette fois (voir buildProposals). Volontairement
 * plus bas que AUTO_ACCEPT_CONFIDENCE — entre les deux, la proposition
 * initiale est déjà correcte et n'a pas besoin de ce second passage, plus
 * lent et plus coûteux.
 */
export const WEB_SEARCH_CONFIDENCE_THRESHOLD = 0.6

/** Un marchand et les transactions non catégorisées qui lui appartiennent. */
export interface MerchantGroup {
  merchant: string
  /** Transaction représentative : la plus grosse du groupe (voir groupByMerchant). */
  description: string
  amount: number
  /** Somme signée des montants du groupe : négative pour des dépenses,
   *  positive pour des revenus. Un remboursement vient donc en déduction. */
  total: number
  transactionIds: number[]
}

type GroupableTransaction = Pick<Transaction, 'id' | 'description' | 'amount' | 'merchant_key'>

/**
 * Regroupe des transactions par marchand, pour n'interroger le LLM qu'une fois
 * par marchand plutôt qu'une fois par ligne.
 *
 * Le représentant du groupe est la transaction du plus gros montant : c'est
 * généralement le libellé le plus complet, et c'est celui que l'utilisateur
 * reconnaîtra le mieux à la relecture. Les groupes sont rendus par impact
 * décroissant pour que ce qui pèse sur le budget soit traité en premier, y
 * compris si l'utilisateur s'arrête en cours de route.
 */
export function groupByMerchant(transactions: GroupableTransaction[]): MerchantGroup[] {
  const groups = new Map<string, GroupableTransaction[]>()

  for (const tx of transactions) {
    // merchant_key est calculée à l'insertion, mais un appelant peut travailler
    // sur des transactions construites en mémoire : on retombe sur le calcul.
    const key = tx.merchant_key?.trim() || normalizeMerchant(tx.description)
    if (!key) continue
    const existing = groups.get(key)
    if (existing) existing.push(tx)
    else groups.set(key, [tx])
  }

  return Array.from(groups.entries())
    .map(([merchant, txs]) => {
      const representative = txs.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a))
      return {
        merchant,
        description: representative.description,
        amount: representative.amount,
        total: txs.reduce((sum, t) => sum + t.amount, 0),
        transactionIds: txs.map((t) => t.id)
      }
    })
    // Tri sur l'impact, dépense ou revenu confondus.
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

export interface CategorySuggestion {
  id: number
  category: string
  /** Confiance déclarée par le modèle, de 0 à 1. */
  confidence: number
}

/** Confiance retenue quand le modèle n'en renvoie pas d'exploitable. Volontairement
 *  basse : une proposition non chiffrée ne doit pas passer pour une certitude. */
const DEFAULT_CONFIDENCE = 0.5

/** Extrait/valide le tableau JSON renvoyé par le LLM. Séparée de
 *  categorizeBatch pour être testable sans appel réseau. */
export function parseCategorizationResponse(
  response: string,
  transactions: { id: number; description: string; amount: number }[],
  catList: string[],
  fallback: string
): CategorySuggestion[] {
  const match = response.match(/\[[\s\S]*?\]/)
  if (!match) return []

  try {
    const parsed = JSON.parse(match[0]) as unknown
    // Le mapping catégorie↔transaction se fait par position dans le tableau :
    // un décalage de longueur (ligne fusionnée/omise par le modèle) ferait
    // silencieusement assigner la mauvaise catégorie à toutes les transactions
    // suivantes. On rejette le lot plutôt que de risquer un mauvais classement.
    if (!Array.isArray(parsed) || parsed.length !== transactions.length) return []

    return transactions.map((t, i) => {
      const { category, confidence } = readSuggestion(parsed[i])
      return {
        id: t.id,
        category: catList.includes(category) ? category : fallback,
        // Une catégorie hors liste est un signal d'incertitude en soi : la
        // laisser passer avec la confiance annoncée la ferait accepter
        // automatiquement alors qu'elle a été remplacée par le repli.
        confidence: catList.includes(category) ? confidence : 0
      }
    })
  } catch {
    return []
  }
}

/** Lit un élément de réponse, en tolérant l'ancien format (chaîne nue) que les
 *  modèles produisent encore régulièrement malgré la consigne. */
function readSuggestion(raw: unknown): { category: string; confidence: number } {
  if (typeof raw === 'string') return { category: raw, confidence: DEFAULT_CONFIDENCE }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const category = typeof obj.categorie === 'string' ? obj.categorie
      : typeof obj.category === 'string' ? obj.category
      : ''
    const rawConfidence = typeof obj.confiance === 'number' ? obj.confiance
      : typeof obj.confidence === 'number' ? obj.confidence
      : NaN
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : DEFAULT_CONFIDENCE
    return { category, confidence }
  }

  return { category: '', confidence: DEFAULT_CONFIDENCE }
}


/** Décision mémorisée, telle que la couche de rattrapage flou la consulte. */
export interface RememberedMerchant {
  merchant_key: string
  category: string
  count: number
}

/** Nombre de mots communs exigé pour rapprocher deux clés marchand. */
const MIN_SHARED_TOKENS = 2

/**
 * Rattrape les quasi-correspondances que l'égalité stricte de clé marchand
 * laisse passer : `CARREFOUR MARKET PARIS` et `CARREFOUR MARKET LYON` sont deux
 * clés distinctes mais un seul et même choix de catégorie.
 *
 * Le critère est le nombre de mots communs, et non un score de similarité :
 * sur des clés de un à trois mots, un seuil sur un score continu serait
 * arbitraire et impossible à expliquer à l'utilisateur, là où « au moins deux
 * mots en commun » se raisonne directement. Exiger deux mots écarte le piège
 * principal — `BOULANGERIE MARTIN` et `BOULANGERIE DUPONT` ne partagent que le
 * métier, pas le commerçant.
 *
 * En cas de candidats à égalité qui ne s'accordent pas sur la catégorie, on ne
 * tranche pas : mieux vaut laisser la transaction sans catégorie que de la
 * classer à pile ou face.
 */
export function findFuzzyCategory(
  merchantKey: string,
  memory: RememberedMerchant[]
): string | null {
  const target = new Set(merchantKey.split(' ').filter(Boolean))
  if (target.size === 0) return null

  const candidates: { category: string; shared: number; count: number }[] = []

  for (const entry of memory) {
    if (entry.merchant_key === merchantKey) continue // déjà traité en exact

    let shared = 0
    for (const token of new Set(entry.merchant_key.split(' '))) {
      if (target.has(token)) shared++
    }
    if (shared >= MIN_SHARED_TOKENS) {
      candidates.push({ category: entry.category, shared, count: entry.count })
    }
  }

  if (candidates.length === 0) return null

  // Le meilleur candidat est le plus proche (mots communs), puis le plus établi.
  candidates.sort((a, b) => b.shared - a.shared || b.count - a.count)
  const best = candidates[0]

  // Si d'autres candidats sont aussi bien placés sans s'accorder sur la
  // catégorie, on ne tranche pas.
  const tied = candidates.filter((c) => c.shared === best.shared && c.count === best.count)
  if (tied.some((c) => c.category !== best.category)) return null

  return best.category
}

/**
 * Transforme un texte saisi tel quel en motif de règle.
 *
 * Les règles sont stockées en expression régulière, mais l'écrasante majorité
 * d'entre elles se résume à « le libellé contient ce mot ». Demander une regex
 * pour cela est une barrière à l'entrée sans contrepartie : on échappe donc les
 * caractères spéciaux pour l'utilisateur.
 */
export function literalToRulePattern(text: string): string {
  return text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
