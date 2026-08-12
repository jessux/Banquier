import type { Transaction } from './types'
import { normalizeMerchant } from './merchant'

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

