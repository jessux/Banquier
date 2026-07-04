import type { ChatMemory } from '../shared/types'

/**
 * Récupération BM25 (Okapi) sur la mémoire IA — l'étape « retrieval » du RAG.
 * Implémentation locale sans dépendance : OpenRouter n'expose pas d'API
 * d'embeddings, et le corpus (quelques dizaines de mémoires) reste minuscule.
 */

const BM25_K1 = 1.5
const BM25_B = 0.75

/** Tokenise en minuscules sans accents, mots de 3+ lettres/chiffres. */
function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[a-z0-9]{3,}/g) ?? []
  )
}

/**
 * Retourne les `k` mémoires les plus pertinentes pour la question posée,
 * classées par score BM25 décroissant. Les mémoires sans recouvrement lexical
 * avec la question sont exclues.
 */
export function retrieveRelevantMemories(
  query: string,
  memories: ChatMemory[],
  k = 5
): ChatMemory[] {
  if (memories.length === 0) return []

  const queryTerms = [...new Set(tokenize(query))]
  if (queryTerms.length === 0) return []

  const docs = memories.map((m) => tokenize(m.content))
  const avgLength = docs.reduce((acc, d) => acc + d.length, 0) / docs.length || 1

  // Nombre de documents contenant chaque terme de la requête (pour l'IDF).
  const docFrequency = new Map<string, number>()
  for (const term of queryTerms) {
    docFrequency.set(term, docs.filter((d) => d.includes(term)).length)
  }

  const scored = memories.map((memory, i) => {
    const doc = docs[i]
    let score = 0
    for (const term of queryTerms) {
      const df = docFrequency.get(term) ?? 0
      if (df === 0) continue
      const tf = doc.filter((t) => t === term).length
      if (tf === 0) continue
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5))
      score += (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / avgLength)))
    }
    return { memory, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.memory)
}
