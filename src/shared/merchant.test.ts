import { describe, expect, it } from 'vitest'
import { normalizeMerchant } from './merchant'

describe('normalizeMerchant', () => {
  it('fait converger le même marchand malgré la date, la ville et la référence', () => {
    const a = normalizeMerchant('CB CARREFOUR MARKET 12/03 PARIS 4589')
    const b = normalizeMerchant('PAIEMENT CARREFOUR MARKET 28/04 PARIS 7712')
    expect(a).toBe(b)
    expect(a).toBe('CARREFOUR MARKET PARIS')
  })

  it('ignore les accents et la casse', () => {
    expect(normalizeMerchant('Café Étoile')).toBe(normalizeMerchant('CAFE ETOILE'))
  })

  it('retire les jetons contenant des chiffres', () => {
    expect(normalizeMerchant('SNCF 12/03 REF 998877')).toBe('SNCF')
  })

  it('retire les initiales isolées', () => {
    expect(normalizeMerchant('E.LECLERC BORDEAUX')).toBe('LECLERC BORDEAUX')
  })

  it('retire le vocabulaire bancaire et les formes juridiques', () => {
    expect(normalizeMerchant('PRLV SEPA SARL BOULANGERIE MARTIN')).toBe('BOULANGERIE MARTIN')
  })

  it('ne confond pas deux marchands différents de la même enseigne', () => {
    expect(normalizeMerchant('CB CARREFOUR CITY LYON')).not.toBe(
      normalizeMerchant('CB CARREFOUR MARKET LYON')
    )
  })

  it("conserve « INTERNET », qui fait partie du nom réel de certains marchands", () => {
    expect(normalizeMerchant('PRLV FREE INTERNET')).toBe('FREE INTERNET')
  })

  it('se limite à trois mots', () => {
    expect(normalizeMerchant('ALPHA BETA GAMMA DELTA EPSILON').split(' ')).toHaveLength(3)
  })

  it('retombe sur le libellé nettoyé quand tout est du bruit, sans clé vide', () => {
    // Une clé vide serait partagée par des marchands sans rapport et leur
    // donnerait à tous la même catégorie.
    expect(normalizeMerchant('VIR SEPA 12/03')).not.toBe('')
    expect(normalizeMerchant('CARTE 4589')).not.toBe('')
    expect(normalizeMerchant('VIR SEPA 12/03')).not.toBe(normalizeMerchant('CARTE 4589'))
  })

  it('ne renvoie une clé vide que pour un libellé vide', () => {
    expect(normalizeMerchant('')).toBe('')
    expect(normalizeMerchant('   ')).toBe('')
  })
})
