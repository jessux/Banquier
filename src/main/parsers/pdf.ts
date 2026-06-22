import fs from 'fs'
import type { Transaction } from '../../shared/types'

// pdf-parse has no default ESM export — use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text as string
}

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
        import_id: null
      }))
  } catch {
    return []
  }
}
