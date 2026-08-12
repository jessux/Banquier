/**
 * Normalisation des libellés bancaires en « clé marchand ».
 *
 * Un libellé réel embarque la date, la ville, le numéro de terminal et la
 * référence de mandat : `CB CARREFOUR MARKET 12/03 PARIS 4589` n'apparaîtra
 * jamais deux fois à l'identique. Toute logique qui regroupe des transactions
 * par marchand — mémoire de catégorisation, dédup avant appel LLM, top
 * marchands, détection de récurrences — a donc besoin d'une clé stable, et
 * doit utiliser celle-ci pour que ces fonctionnalités regroupent de la même
 * façon.
 */

/**
 * Mots présents dans les libellés qui décrivent le *moyen de paiement* ou
 * l'habillage bancaire, jamais le marchand. Les retirer fait converger
 * `CB CARREFOUR` et `PAIEMENT CARREFOUR` vers la même clé.
 *
 * Volontairement absents : `INTERNET` et `TELECOM`, qui font partie du nom
 * réel de certains marchands (facture d'accès internet).
 */
const NOISE_TOKENS = new Set([
  // Moyens de paiement / opérations
  'CB', 'CARTE', 'CARD', 'PAIEMENT', 'PAIMT', 'PMT', 'ACHAT', 'RETRAIT', 'DAB',
  'TPE', 'FACTURE', 'FACT', 'PRLV', 'PRELEVEMENT', 'PRELVT', 'PREL', 'VIR',
  'VIREMENT', 'VRST', 'VERSEMENT', 'SEPA', 'TIP', 'CHEQUE', 'CHQ', 'REMISE',
  'AVOIR', 'ANN', 'ANNULATION', 'ECH', 'ECHEANCE',
  // Références techniques
  'REF', 'RUM', 'MANDAT', 'ID', 'NUM', 'NO', 'EUR', 'EUROS',
  // Formes juridiques
  'SARL', 'SAS', 'SASU', 'EURL', 'SA', 'SNC', 'SCI', 'ETS', 'SOC', 'CIE',
  // Mots outils
  'DU', 'LE', 'LA', 'LES', 'DE', 'DES', 'AU', 'AUX', 'ET', 'SUR', 'PAR',
  'POUR', 'SANS', 'CHEZ'
])

/** Nombre de mots conservés dans la clé. */
const KEY_TOKENS = 3

/**
 * Réduit un libellé à sa clé marchand : majuscules, sans accents, sans
 * ponctuation, sans mots parasites, sans jetons contenant des chiffres
 * (dates, montants, références), limitée aux {@link KEY_TOKENS} premiers mots.
 *
 * Retourne une clé vide seulement si le libellé lui-même est vide — sinon on
 * retombe sur le libellé nettoyé, quitte à ce qu'il ne regroupe rien : mieux
 * vaut une clé trop précise (qui ne regroupe pas) qu'une clé vide partagée par
 * des marchands sans rapport, qui leur donnerait à tous la même catégorie.
 */
export function normalizeMerchant(description: string): string {
  const tokens = description
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0)

  const kept = tokens.filter(
    (t) =>
      t.length > 1 && // initiales isolées (E.LECLERC → LECLERC, CARTE X 1234 → ∅)
      !/[0-9]/.test(t) && // dates, montants, réf. de mandat, n° de terminal
      !NOISE_TOKENS.has(t)
  )

  if (kept.length > 0) return kept.slice(0, KEY_TOKENS).join(' ')

  // Libellé entièrement composé de bruit : on garde le texte nettoyé plutôt
  // que de renvoyer une clé vide (voir docblock).
  const fallback = tokens.slice(0, KEY_TOKENS).join(' ')
  return fallback || description.trim().toUpperCase().slice(0, 30)
}
