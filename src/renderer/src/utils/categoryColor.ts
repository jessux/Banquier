import type React from 'react'

export function categoryHue(cat: string): number {
  const name = cat.includes(' > ') ? cat.slice(0, cat.indexOf(' > ')) : cat
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % 360
}

export function categoryBadgeStyle(cat: string | null): React.CSSProperties {
  if (!cat) return {}
  const hue = categoryHue(cat)
  return {
    background: `hsl(${hue},45%,16%)`,
    borderColor: `hsl(${hue},45%,28%)`,
    color: `hsl(${hue},70%,72%)`
  }
}

/** Couleur de fond pleine (pastille ronde) pour une catégorie, utilisée dans la liste mobile. */
export function categoryCircleColor(cat: string | null): string {
  if (!cat) return '#5b6478'
  return `hsl(${categoryHue(cat)},55%,42%)`
}

const ICON_RULES: Array<{ match: RegExp; icon: string }> = [
  { match: /virement|interne|transfer/i, icon: '🔄' },
  { match: /aliment|courses|supermarch/i, icon: '🛒' },
  { match: /logement|loyer|immobilier/i, icon: '🏠' },
  { match: /transport|sncf|m[eé]tro|\bbus\b|comutit|imagine r/i, icon: '🚌' },
  { match: /restaurant|repas/i, icon: '🍴' },
  { match: /loisir|jeu|cin[eé]ma|sport/i, icon: '🎮' },
  { match: /sant[eé]|m[eé]decin|docteur|pharmacie|h[oô]pital|dr\.?\s/i, icon: '💊' },
  { match: /shopping|achat|habillement|v[eê]tement/i, icon: '🛍️' },
  { match: /abonnement|t[eé]l[eé]com|internet|free|orange|sfr|bouygues|wifi/i, icon: '📶' },
  { match: /\beau\b|electricit|[eé]nergie|\bgaz\b|edf|suez/i, icon: '💧' },
  { match: /[eé]pargne|livret|placement/i, icon: '💰' },
  { match: /salaire|paie|r[eé]mun[eé]ration/i, icon: '💼' },
  { match: /don|association|solidarit|frontier/i, icon: '❤️' },
  { match: /assurance/i, icon: '🛡️' },
  { match: /pr[eê]t|emprunt|cr[eé]dit|remboursement|ing bank/i, icon: '🏦' },
  { match: /paypal|en ligne|service/i, icon: '🌐' },
]

/** Icône (emoji) représentant une transaction, déduite de sa catégorie puis, à défaut, de sa description. */
export function categoryIcon(cat: string | null, description?: string): string {
  for (const { match, icon } of ICON_RULES) {
    if (cat && match.test(cat)) return icon
  }
  if (description) {
    for (const { match, icon } of ICON_RULES) {
      if (match.test(description)) return icon
    }
  }
  return '💳'
}
