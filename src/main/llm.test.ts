import { describe, expect, it } from 'vitest'
import { parseCategorizationResponse } from './llm'

const catList = ['Alimentation', 'Transport', 'Autre']
const fallback = 'Autre'
const transactions = [
  { id: 1, description: 'CB FNAC', amount: -50 },
  { id: 2, description: 'CB CARREFOUR', amount: -30 },
  { id: 3, description: 'SNCF', amount: -20 }
]

describe('parseCategorizationResponse', () => {
  it('associe les catégories aux transactions par position quand les longueurs correspondent', () => {
    const response = 'Voici le résultat: ["Alimentation", "Alimentation", "Transport"]'
    const result = parseCategorizationResponse(response, transactions, catList, fallback)
    expect(result).toEqual([
      { id: 1, category: 'Alimentation' },
      { id: 2, category: 'Alimentation' },
      { id: 3, category: 'Transport' }
    ])
  })

  it("rejette le lot si le modèle renvoie moins d'éléments que de transactions envoyées", () => {
    // Un décalage de longueur (ligne fusionnée/omise) ferait assigner la
    // mauvaise catégorie à toutes les transactions suivantes si on mappait
    // quand même par position — on doit rejeter plutôt que mal classer.
    const response = '["Alimentation", "Transport"]'
    expect(parseCategorizationResponse(response, transactions, catList, fallback)).toEqual([])
  })

  it("rejette le lot si le modèle renvoie plus d'éléments que de transactions envoyées", () => {
    const response = '["Alimentation", "Alimentation", "Transport", "Autre"]'
    expect(parseCategorizationResponse(response, transactions, catList, fallback)).toEqual([])
  })

  it('retombe sur la catégorie de repli si une catégorie proposée est hors liste', () => {
    const response = '["Loisirs", "Alimentation", "Transport"]'
    const result = parseCategorizationResponse(response, transactions, catList, fallback)
    expect(result[0].category).toBe('Autre')
  })

  it('retourne un tableau vide si la réponse ne contient aucun JSON', () => {
    expect(parseCategorizationResponse('Désolé, je ne peux pas répondre.', transactions, catList, fallback)).toEqual([])
  })

  it('retourne un tableau vide si le JSON est invalide', () => {
    expect(parseCategorizationResponse('[Alimentation, Transport, Autre]', transactions, catList, fallback)).toEqual([])
  })
})
