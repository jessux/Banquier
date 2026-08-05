import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Transaction } from '../../shared/types'
import { getCachedFile } from '../file-picker'

// Pas de `GlobalWorkerOptions.workerSrc` ici, volontairement : voir le commentaire
// détaillé au-dessus d'`extractPdfText` plus bas, et docs/mobile.md (section Phase 5).

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Extrait le texte brut d'un PDF déjà mis en cache par file-picker.ts (voir
 *  getCachedFile). Équivalent mobile d'`extractPdfText` dans
 *  `src/main/parsers/pdf.ts`, mais entièrement côté client (pdf.js/WASM) au lieu
 *  du `pdf-parse` Node-only du desktop (basé sur `fs.readFileSync` + le module
 *  natif `pdf-parse`, indisponibles dans le bundle renderer mobile).
 *
 *  Web Worker désactivé intentionnellement (aucun `GlobalWorkerOptions.workerSrc`
 *  configuré) : pdf.js retombe alors automatiquement sur son "fake worker", qui
 *  exécute le parsing sur le thread principal au lieu d'un Worker dédié (avec un
 *  simple `console.warn("Setting up fake worker.")`, sans erreur). C'est un
 *  compromis délibéré plutôt qu'un oubli — voir docs/mobile.md pour le détail
 *  du raisonnement (chargement de Worker peu fiable dans une WebView Capacitor :
 *  URL blob/module Worker, CSP, origine `file://`/`https://localhost` selon la
 *  plateforme…) et le risque que ça représente, non vérifiable sans appareil réel. */
export async function extractPdfText(handle: string): Promise<string> {
  const cached = getCachedFile(handle)
  if (!cached) throw new Error('Fichier introuvable — veuillez le resélectionner')

  const data = decodeBase64ToBytes(cached.base64)
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise

  const pageTexts: string[] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pageTexts.push(pageText)
  }
  await doc.destroy()

  return pageTexts.join('\n')
}

// --- Ce qui suit est dupliqué verbatim depuis src/main/parsers/pdf.ts -------------
// Fonctions pures (aucune I/O), volontairement copiées plutôt qu'importées : le
// fichier desktop fait `import fs from 'fs'` et `require('pdf-parse')` en tête de
// module, ce qui casserait le bundle renderer mobile (build navigateur classique,
// sans polyfills Node) rien qu'en important ce fichier. Toute modification de la
// logique ci-dessous côté desktop doit être reportée ici manuellement.

export function buildPdfParsePrompt(text: string): string {
  return `Tu es un assistant spécialisé en analyse de relevés bancaires.

Voici le texte brut extrait d'un relevé bancaire PDF :

\`\`\`
${text.slice(0, 8000)}
\`\`\`

Extrais toutes les transactions bancaires et retourne UNIQUEMENT un tableau JSON valide avec cette structure exacte :
[
  {
    "date": "YYYY-MM-DD",
    "description": "libellé de la transaction",
    "amount": -12.50
  }
]

Règles importantes :
- Les débits (dépenses) doivent avoir un montant négatif
- Les crédits (revenus/virements reçus) doivent avoir un montant positif
- La date doit être au format ISO 8601 (YYYY-MM-DD)
- Si la date n'a pas d'année, utilise l'année visible dans le relevé
- Ne retourne QUE le JSON, sans texte explicatif avant ou après
- Si tu ne trouves aucune transaction, retourne []`
}

export function parseLlmJsonResponse(response: string): Omit<Transaction, 'id'>[] {
  // Extract JSON from the response (LLM may add markdown code blocks)
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { date: string; description: string; amount: number }[]
    return parsed
      .filter((t) => t.date && t.description && typeof t.amount === 'number')
      .map((t) => ({
        account_id: null,
        date: t.date,
        description: t.description.trim(),
        amount: t.amount,
        category: null,
        import_id: null,
        is_internal: 0,
        note: null,
        tags: null
      }))
  } catch {
    return []
  }
}
