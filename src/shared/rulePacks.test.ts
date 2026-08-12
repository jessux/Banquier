import { describe, expect, it } from 'vitest'
import {
  analyzePatternSafety,
  categoryPathsOfPack,
  compareVersions,
  findShadowedRules,
  FR_BASE_PACK,
  looksLikeInternalCategory,
  packIdFromSource,
  packSource,
  validatePack,
  MAX_PATTERN_LENGTH
} from './rulePacks'

describe('analyzePatternSafety', () => {
  it('accepte les patterns de marchands courants', () => {
    for (const pattern of [
      'CARREFOUR',
      'UBER\\s?EATS',
      '\\bLIDL\\b|\\bALDI\\b',
      'PRLV.{0,20}EDF',
      'COTISATION.{0,20}(CARTE|COMPTE)'
    ]) {
      expect(analyzePatternSafety(pattern), pattern).toMatchObject({ safe: true })
    }
  })

  it('refuse une regex invalide', () => {
    expect(analyzePatternSafety('CARREFOUR(')).toMatchObject({ safe: false })
  })

  it('refuse un pattern qui accepte la chaîne vide', () => {
    // `.*` attraperait toutes les transactions et court-circuiterait la suite.
    expect(analyzePatternSafety('.*')).toMatchObject({ safe: false })
    expect(analyzePatternSafety('A?B?')).toMatchObject({ safe: false })
    // En revanche `AB?` exige un « A » : il ne matche pas le vide.
    expect(analyzePatternSafety('AB?')).toMatchObject({ safe: true })
  })

  it('refuse les quantificateurs imbriqués (ReDoS)', () => {
    for (const pattern of ['(a+)+$', '(a*)*b', '(\\d{2,})+X', '(ab?)+c', '((x+))+y']) {
      expect(analyzePatternSafety(pattern), pattern).toMatchObject({ safe: false })
    }
  })

  it('ne confond pas un groupe non capturant avec un quantificateur', () => {
    expect(analyzePatternSafety('(?:CARREFOUR|LECLERC)')).toMatchObject({ safe: true })
    expect(analyzePatternSafety('(?=.*CB)CARREFOUR')).toMatchObject({ safe: true })
  })

  it('ne compte pas les quantificateurs littéraux dans une classe', () => {
    expect(analyzePatternSafety('[+*]CARREFOUR')).toMatchObject({ safe: true })
    expect(analyzePatternSafety('CB[ -]?CARREFOUR')).toMatchObject({ safe: true })
  })

  it('refuse un pattern trop long', () => {
    expect(analyzePatternSafety('A'.repeat(MAX_PATTERN_LENGTH + 1))).toMatchObject({ safe: false })
  })

  it('reste rapide sur une entrée pathologique', () => {
    // Garde-fou empirique : les patterns acceptés ne doivent pas exploser sur un
    // libellé adverse de longueur réaliste.
    const start = Date.now()
    const regex = new RegExp('COTISATION.{0,20}(CARTE|COMPTE)', 'i')
    regex.test('COTISATION' + 'A'.repeat(500))
    expect(Date.now() - start).toBeLessThan(100)
  })
})

describe('validatePack', () => {
  const base = {
    id: 'test-pack',
    version: '1.0.0',
    name: 'Test',
    locale: 'fr-FR',
    categories: [{ name: 'Alimentation', children: ['Épicerie'] }],
    rules: [{ pattern: 'CARREFOUR', category: 'Alimentation > Épicerie', examples: ['CB CARREFOUR'] }]
  }

  it('valide un pack correct', () => {
    const result = validatePack(base)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejette un id mal formé', () => {
    expect(validatePack({ ...base, id: 'Test Pack' }).valid).toBe(false)
  })

  it('rejette une version non semver', () => {
    expect(validatePack({ ...base, version: '1.0' }).valid).toBe(false)
  })

  it('rejette une catégorie absente de l’arbre du pack', () => {
    const result = validatePack({
      ...base,
      rules: [{ pattern: 'CARREFOUR', category: 'Alimentation > Inexistante' }]
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toContain('absente de l')
  })

  it('rejette un pattern dupliqué', () => {
    const result = validatePack({
      ...base,
      rules: [
        { pattern: 'CARREFOUR', category: 'Alimentation > Épicerie' },
        { pattern: 'CARREFOUR', category: 'Alimentation' }
      ]
    })
    expect(result.errors.join()).toContain('dupliqué')
  })

  it('rejette un exemple non capturé par son pattern', () => {
    const result = validatePack({
      ...base,
      rules: [{ pattern: 'CARREFOUR', category: 'Alimentation', examples: ['CB LECLERC'] }]
    })
    expect(result.errors.join()).toContain('CB LECLERC')
  })

  it('signale une règle sans exemple', () => {
    const result = validatePack({
      ...base,
      rules: [{ pattern: 'LECLERC', category: 'Alimentation' }]
    })
    expect(result.valid).toBe(true)
    expect(result.warnings.join()).toContain('aucun exemple')
  })
})

describe('pack fr-base', () => {
  it('passe sa propre validation', () => {
    const result = validatePack(FR_BASE_PACK)
    expect(result.errors).toEqual([])
  })

  it('n’a aucune règle masquée par une règle antérieure', () => {
    // UBER EATS doit précéder UBER, TOTALENERGIES doit précéder TOTAL ACCESS, etc.
    const shadowed = findShadowedRules(FR_BASE_PACK).map(
      (s) => `${FR_BASE_PACK.rules[s.index].pattern} masquée par ${FR_BASE_PACK.rules[s.shadowedBy].pattern}`
    )
    expect(shadowed).toEqual([])
  })

  it('classe correctement les libellés ambigus', () => {
    const firstMatch = (description: string): string | null => {
      for (const rule of FR_BASE_PACK.rules) {
        if (new RegExp(rule.pattern, 'i').test(description)) return rule.category
      }
      return null
    }

    expect(firstMatch('CB UBER EATS 12/03')).toBe('Restaurants > Livraison repas')
    expect(firstMatch('CB UBER BV AMSTERDAM')).toBe('Transport > Taxi / VTC')
    expect(firstMatch('PRLV SEPA TOTALENERGIES ELECTRICITE')).toBe('Logement > Électricité / Gaz')
    expect(firstMatch('CB TOTAL ACCESS MERIGNAC')).toBe('Transport > Carburant')
  })

  it('ne réagit pas à des libellés hors périmètre', () => {
    const matches = (description: string): boolean =>
      FR_BASE_PACK.rules.some((r) => new RegExp(r.pattern, 'i').test(description))

    // « ACTION » ne doit pas être déclenché par « TRANSACTION ».
    expect(matches('FRAIS SUR TRANSACTION ETRANGERE')).toBe(false)
    expect(matches('VIR M DUPONT JEAN')).toBe(false)
  })

  it('expose les catégories au format « Parent > Enfant »', () => {
    const paths = categoryPathsOfPack(FR_BASE_PACK)
    expect(paths).toContain('Alimentation')
    expect(paths).toContain('Alimentation > Épicerie')
  })

  it('ne marque comme interne que la règle de virement interne', () => {
    const internal = FR_BASE_PACK.rules.filter((r) => r.internal).map((r) => r.category)
    expect(internal).toEqual(['Virements internes'])
  })
})

describe('looksLikeInternalCategory', () => {
  it('reconnaît les catégories de mouvement interne', () => {
    expect(looksLikeInternalCategory('Virements internes')).toBe(true)
    expect(looksLikeInternalCategory('Virement interne')).toBe(true)
    expect(looksLikeInternalCategory('Compte > Interne')).toBe(true)
  })

  it('ne se déclenche pas sur « Internet » (régression du marquage is_internal)', () => {
    // L'ancien test `includes('intern')` sortait les factures internet des
    // totaux de dépenses.
    expect(looksLikeInternalCategory('Logement > Internet / Téléphone')).toBe(false)
    expect(looksLikeInternalCategory('Virement international')).toBe(false)
  })
})

describe('helpers', () => {
  it('convertit id ↔ source', () => {
    expect(packSource('fr-base')).toBe('pack:fr-base')
    expect(packIdFromSource('pack:fr-base')).toBe('fr-base')
    expect(packIdFromSource('user')).toBeNull()
  })

  it('compare les versions', () => {
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.2.0')).toBeLessThan(0)
  })
})
