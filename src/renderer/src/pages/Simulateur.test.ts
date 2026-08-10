import { describe, expect, it } from 'vitest'
import { computeLoanFromPrincipal, computeLoanFromPayment, loanPayment, loanPrincipal } from './Simulateur'

describe('loanPayment / loanPrincipal', () => {
  it('calcule la mensualité d’un prêt classique (200 000 € à 3 % sur 20 ans)', () => {
    const payment = loanPayment(200000, 0.03 / 12, 240)
    expect(payment).toBeCloseTo(1109.16, 1)
  })

  it('gère un taux à 0 % (mensualité = capital / durée)', () => {
    expect(loanPayment(12000, 0, 12)).toBeCloseTo(1000, 6)
  })

  it('loanPrincipal est l’inverse exact de loanPayment', () => {
    const monthlyRate = 0.025 / 12
    const nMonths = 180
    const payment = loanPayment(150000, monthlyRate, nMonths)
    expect(loanPrincipal(payment, monthlyRate, nMonths)).toBeCloseTo(150000, 4)
  })
})

describe('computeLoanFromPrincipal', () => {
  it('produit un échéancier qui solde exactement le capital à la dernière mensualité', () => {
    const result = computeLoanFromPrincipal(50000, 0.04, 5)
    expect(result).not.toBeNull()
    const last = result!.schedule[result!.schedule.length - 1]
    expect(last.remaining).toBe(0)
    expect(result!.schedule).toHaveLength(60)
  })

  it('le total remboursé = capital + coût total du crédit', () => {
    const result = computeLoanFromPrincipal(100000, 0.035, 15)!
    expect(result.totalPaid).toBeCloseTo(result.principal + result.totalInterest, 6)
  })

  it('la somme des parts de capital de l’échéancier reconstitue le capital emprunté', () => {
    const result = computeLoanFromPrincipal(80000, 0.02, 10)!
    const sumPrincipal = result.schedule.reduce((s, r) => s + r.principal, 0)
    expect(sumPrincipal).toBeCloseTo(80000, 4)
  })

  it('retourne null pour des paramètres invalides', () => {
    expect(computeLoanFromPrincipal(0, 0.03, 20)).toBeNull()
    expect(computeLoanFromPrincipal(100000, 0.03, 0)).toBeNull()
  })
})

describe('computeLoanFromPayment', () => {
  it('est cohérent avec computeLoanFromPrincipal (aller-retour)', () => {
    const forward = computeLoanFromPrincipal(200000, 0.03, 20)!
    const inverse = computeLoanFromPayment(forward.payment, 0.03, 20)!
    expect(inverse.principal).toBeCloseTo(200000, 1)
  })
})
