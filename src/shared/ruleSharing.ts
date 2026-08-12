/**
 * Décide si une règle écrite par l'utilisateur peut être proposée au dépôt
 * communautaire.
 *
 * Le point de départ : les patterns contiennent régulièrement des données
 * personnelles. Le geste naturel est de voir « VIR SEPA JEAN DUPONT » dans son
 * relevé et d'en faire la règle « JEAN DUPONT → Salaire ». Sont aussi courants
 * les noms de propriétaire, d'employeur, de proches (« VIR PAPA »), et des
 * fragments de numéros de compte.
 *
 * Ce module écarte ces règles AVANT toute sortie de l'appareil. Il est
 * volontairement strict : écarter à tort une règle publiable ne coûte rien
 * (elle reste active en local), la laisser passer expose une personne réelle.
 *
 * Il ne remplace pas la relecture par l'utilisateur avant envoi — c'est une
 * première barrière, pas une garantie.
 */

/**
 * Longueur minimale de contenu littéral, hors métacaractères regex.
 * Trois caractères, parce que beaucoup d'enseignes françaises tiennent en un
 * sigle : EDF, SFR, KFC, UGC, BUT, GAP, H&M.
 */
const MIN_LITERAL_LENGTH = 3

/**
 * Termes familiaux : jamais une enseigne, toujours une personne. Refus ferme.
 */
const FAMILIAL_TERMS = new Set([
  'papa', 'maman', 'mamie', 'papi', 'papy', 'maman', 'tonton', 'tata',
  'parrain', 'marraine', 'frere', 'soeur', 'fiston'
])

/**
 * Prénoms les plus courants en France. Sert à repérer les libellés de virement
 * entre particuliers. Liste délibérément courte : elle couvre les cas fréquents,
 * la relecture avant envoi couvre le reste.
 *
 * ATTENTION : la seule présence d'un prénom ne suffit PAS à refuser. Beaucoup
 * d'enseignes françaises portent un prénom (Paul, Nicolas, Jules, André, La Vie
 * Claire…). Voir looksLikePerson() pour les conditions réelles de refus.
 */
const COMMON_FORENAMES = new Set([
  'marie', 'jean', 'pierre', 'michel', 'andre', 'philippe', 'alain', 'jacques',
  'bernard', 'daniel', 'claude', 'christian', 'nicolas', 'julien', 'thomas',
  'david', 'stephane', 'laurent', 'olivier', 'patrick', 'eric', 'sebastien',
  'frederic', 'christophe', 'vincent', 'antoine', 'guillaume', 'alexandre',
  'maxime', 'romain', 'lucas', 'hugo', 'theo', 'enzo', 'nathan', 'gabriel',
  'raphael', 'arthur', 'louis', 'jules', 'adam', 'paul', 'clement', 'quentin',
  'florian', 'kevin', 'anthony', 'mathieu', 'benjamin', 'damien', 'fabien',
  'jerome', 'ludovic', 'cedric', 'sylvain', 'yann', 'remi', 'baptiste', 'come',
  'martin', 'simon', 'victor', 'noah', 'ethan', 'axel', 'evan', 'mathis',
  'nathalie', 'isabelle', 'sylvie', 'catherine', 'francoise', 'monique',
  'christine', 'martine', 'brigitte', 'nicole', 'anne', 'chantal', 'veronique',
  'sandrine', 'valerie', 'sophie', 'stephanie', 'celine', 'julie', 'aurelie',
  'emilie', 'laetitia', 'virginie', 'caroline', 'delphine', 'elodie', 'audrey',
  'camille', 'laura', 'marine', 'pauline', 'manon', 'lea', 'chloe', 'emma',
  'sarah', 'clara', 'ines', 'jade', 'louise', 'alice', 'lina', 'rose', 'anna',
  'juliette', 'zoe', 'lucie', 'charlotte', 'oceane', 'melanie', 'amandine',
  'claire', 'helene', 'patricia', 'dominique', 'corinne', 'karine', 'sabrina',
  'fatima', 'aicha', 'youssef', 'mohamed', 'karim', 'said', 'rachid', 'samir',
  'nadia', 'leila', 'sofia', 'yasmine', 'ali', 'omar', 'hassan', 'ibrahim'
])

/**
 * Marqueurs de virement, recherchés n'importe où dans le pattern.
 *
 * « payment » et « transfer » en sont volontairement absents : ils abondent
 * dans les descripteurs marchands (« AMAZON PAYMENT », « PAYPAL PAYMENT ») et
 * n'indiquent rien sur la nature du bénéficiaire.
 */
const TRANSFER_MARKERS = new Set([
  'vir', 'virement', 'sepa', 'chq', 'cheque', 'remb', 'rbt'
])

/**
 * Prépositions de destination, cherchées en tête ou en deuxième position — de
 * quoi couvrir « To José Marques » comme « Payment to José ».
 *
 * Plus loin dans la chaîne, « de » et « pour » sont trop courants pour
 * signifier quoi que ce soit (« Banque de France »).
 */
const DIRECTIONAL_PREFIXES = new Set(['to', 'from', 'vers', 'de', 'pour', 'chez'])

/**
 * Mots par lesquels l'utilisateur qualifie lui-même une opération de privée.
 * Signal le plus fiable dont on dispose : il est écrit par la personne concernée.
 */
const PRIVACY_MARKERS = new Set([
  'perso', 'personnel', 'personnelle', 'prive', 'privee', 'confidentiel'
])

/**
 * Enseignes qui déclencheraient à tort une autre règle : nom identique à un
 * prénom, sigle trop court, ou chiffre dans le nom. Une correspondance ici lève
 * tous les refus.
 *
 * Liste forcément incomplète — c'est un correctif ciblé sur les collisions
 * fréquentes, pas un annuaire du commerce français.
 */
const BRAND_ALLOWLIST: RegExp[] = [
  // Nom = prénom
  /^PAUL$/i, /^NICOLAS$/i, /^JULES$/i, /^ANDRE$/i, /^CAMILLE$/i,
  /MARIE BLACHERE/i, /LA VIE CLAIRE/i, /CLAIRE FONTAINE/i, /ALAIN AFFLELOU/i,
  /YVES ROCHER/i, /LOUIS VUITTON/i, /MICHEL ET AUGUSTIN/i, /SAINT MACLOU/i,
  /JEAN COUTU/i, /HUGO BOSS/i, /CHRISTIAN DIOR/i,
  // Chiffre dans le nom
  /\bG7\b/i, /\bM6\b/i, /E\.?LECLERC/i, /3 SUISSES/i, /CARREFOUR ?24/i,
  /\bMK2\b/i, /\bA2PAS\b/i,
  // Sigles de deux caractères
  /^BUT$/i, /^GAP$/i
]

/**
 * Mots trop génériques pour faire une règle utile : ils décrivent le type
 * d'opération, pas le marchand, et attraperaient une transaction sur deux.
 */
const GENERIC_TOKENS = new Set([
  'virement', 'vir', 'prelevement', 'prlv', 'paiement', 'achat', 'carte', 'cb',
  'retrait', 'facture', 'abonnement', 'remboursement', 'rbt', 'sepa', 'cheque',
  'chq', 'depot', 'especes', 'commission', 'frais', 'operation', 'transaction',
  'credit', 'debit', 'solde', 'echeance', 'mensualite', 'divers', 'autre',
  'versement', 'regulier', 'reguliere', 'mensuel', 'mensuelle'
])

/**
 * Vocabulaire des opérations liées à un compte : crédits, assurances, parts
 * sociales, mandats. Ces libellés ne désignent jamais un marchand — ils
 * décrivent un contrat de l'utilisateur, souvent avec sa banque nommée.
 */
const ACCOUNT_OPERATION_TOKENS = new Set([
  'pret', 'habitat', 'assu', 'souscription', 'ctto', 'efecto', 'crediteurs',
  'debiteurs', 'mandat', 'rum', 'coupon', 'capital', 'soc', 'sociales',
  'nantissement', 'amortissement'
])

/**
 * Trois issues plutôt que deux.
 *
 * Aucune heuristique ne distingue de façon fiable un nom de personne d'un nom
 * d'enseigne : « José Marques » et « Marjorie K » ne figurent dans aucune liste
 * raisonnable de prénoms. Plutôt que de trancher à tort, on isole le doute.
 *
 *   'ok'      → proposé et coché par défaut
 *   'review'  → proposé mais DÉCOCHÉ : l'utilisateur doit le vouloir
 *   'blocked' → jamais proposé
 *
 * Un raté de détection ne devient donc plus une fuite silencieuse, seulement une
 * ligne de plus à ne pas cocher.
 */
export type ShareVerdict = 'ok' | 'review' | 'blocked'

export type ShareRejectionReason =
  | 'personal-name'
  | 'civility'
  | 'privacy-marker'
  | 'transfer'
  | 'name-shape'
  | 'initial'
  | 'contains-digits'
  | 'account-number'
  | 'account-reference'
  | 'account-operation'
  | 'employer'
  | 'too-short'
  | 'too-generic'
  | 'unknown-category'

export interface ShareabilityResult {
  verdict: ShareVerdict
  reason?: ShareRejectionReason
  /** Explication affichable, en français. */
  detail?: string
}

const REASON_LABELS: Record<ShareRejectionReason, string> = {
  'personal-name': 'ressemble à un nom de personne',
  civility: 'contient une civilité (M., Mme…)',
  'privacy-marker': 'marquée comme personnelle',
  transfer: 'ressemble à un virement — le destinataire peut être une personne',
  'name-shape': 'écrit comme un nom propre',
  initial: 'contient une initiale isolée',
  'contains-digits': 'contient des chiffres (référence, date ou numéro possible)',
  'account-number': 'ressemble à un numéro de compte ou un IBAN',
  'account-reference': 'contient une référence de contrat ou un identifiant créancier',
  'account-operation': 'décrit une opération de compte (crédit, assurance, parts sociales)',
  employer: 'un libellé de salaire désigne votre employeur',
  'too-short': `moins de ${MIN_LITERAL_LENGTH} caractères littéraux`,
  'too-generic': 'trop générique pour identifier un marchand',
  'unknown-category': 'pointe vers une catégorie personnelle, absente des packs'
}

export function reasonLabel(reason: ShareRejectionReason): string {
  return REASON_LABELS[reason]
}

/**
 * Extrait le contenu littéral d'une regex : on retire les métacaractères pour
 * juger de la substance réelle du pattern.
 */
function literalTokens(pattern: string): string[] {
  return pattern
    // Un préfixe de lettres collé à \d fait partie du numéro masqué et non du
    // nom du marchand : « CARTE X\d+ » ne doit pas laisser traîner un « X »,
    // qui serait ensuite pris pour une initiale de nom de famille.
    .replace(/[A-Za-z]*\\d/g, ' ')
    .replace(/\\[bBdDwWsSAZ]/g, ' ')
    // Une ponctuation échappée (« \. », « \* », « \/ ») représente un vrai
    // caractère du libellé, donc une frontière de mot. La supprimer soudait
    // « P\.SOC\.LA » en « PSOCLA » et masquait le token « SOC ».
    .replace(/\\(.)/g, ' ')
    // Les bornes de quantificateur doivent partir AVANT le retrait des
    // métacaractères, sinon « {0,10} » laisse le fragment « 0,10 » derrière lui
    // et le pattern est refusé comme s'il contenait un numéro.
    .replace(/\{\d+(,\d*)?\}/g, ' ')
    .replace(/[.*+?^${}()|[\]]/g, ' ')
    .split(/[\s\-_/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Retire les accents pour comparer aux listes de référence. */
function normalize(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Repère une référence de contrat ou un identifiant créancier SEPA.
 *
 * Doit être évalué sur le pattern BRUT : littéraliser « EC\d+ » donne « EC »,
 * ce qui efface justement le signal. Deux formes :
 *
 *   - une classe \d collée à des lettres — « EC\d+ », « FR\d+ZZZ\d+ »,
 *     « \d+ZCL\d+ », « SLMP\d+ », « X\d+ » ;
 *   - plusieurs \d dans le même pattern, qui décrivent un format de référence
 *     ou de date (« \d+ \d+/\d+/\d+ CAPITAL ») et non un marchand.
 *
 * Un \d isolé et détaché reste acceptable : « Action \d+ » vise bien l'enseigne.
 */
function hasAccountReference(pattern: string): boolean {
  // Deux lettres au moins : les identifiants créanciers portent un préfixe
  // (« EC\d+ », « FR\d+ZZZ », « SLMP\d+ »), alors qu'une lettre unique collée à
  // des chiffres est un masque de carte — « CARTE X\d+ » — parfaitement banal.
  if (/[A-Za-z]{2}\\d/.test(pattern)) return true
  if (/\\d(\+|\*|\{\d+(,\d*)?\})?[A-Za-z]{2}/.test(pattern)) return true
  return (pattern.match(/\\d/g) ?? []).length > 1
}

/** Suite d'au moins deux mots en Majuscule-minuscules : « José Marques ». */
function titleCaseRun(tokens: string[]): boolean {
  let run = 0
  for (const token of tokens) {
    if (/^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(token)) {
      run++
      if (run >= 2) return true
    } else {
      run = 0
    }
  }
  return false
}

/** Initiale de nom de famille isolée : le « K » de « To MARJORIE K ». */
function hasLoneInitial(tokens: string[]): boolean {
  return tokens.length >= 2 && tokens.some((t) => /^[A-Za-zÀ-ÿ]$/.test(t))
}

/**
 * Indices qu'un pattern désigne une personne.
 *
 * Aucun n'est décisif seul — les enseignes françaises portent souvent un prénom
 * (Paul, Nicolas, Jules) — mais leur combinaison l'est.
 */
interface PersonSignals {
  forename: boolean
  familial: boolean
  privacy: boolean
  transfer: boolean
  titleCase: boolean
  initial: boolean
}

function personSignals(tokens: string[], normalized: string[]): PersonSignals {
  return {
    forename: normalized.some((t) => COMMON_FORENAMES.has(t)),
    familial: normalized.some((t) => FAMILIAL_TERMS.has(t)),
    privacy: normalized.some((t) => PRIVACY_MARKERS.has(t)),
    transfer:
      normalized.some((t) => TRANSFER_MARKERS.has(t)) ||
      normalized.slice(0, 2).some((t) => DIRECTIONAL_PREFIXES.has(t)),
    titleCase: titleCaseRun(tokens),
    initial: hasLoneInitial(tokens)
  }
}

/**
 * Détermine si une règle utilisateur peut être proposée à la communauté.
 *
 * @param knownCategories chemins de catégorie fournis par les packs installés.
 *        Une règle pointant hors de cet ensemble vise une catégorie personnelle
 *        (« Pension alimentaire Julie »), qui n'a rien à faire dans un pack.
 */
export function analyzeShareability(
  pattern: string,
  category: string,
  knownCategories: Set<string>
): ShareabilityResult {
  const verdictOf = (verdict: ShareVerdict, reason: ShareRejectionReason): ShareabilityResult => ({
    verdict,
    reason,
    detail: REASON_LABELS[reason]
  })
  const block = (reason: ShareRejectionReason): ShareabilityResult => verdictOf('blocked', reason)
  const review = (reason: ShareRejectionReason): ShareabilityResult => verdictOf('review', reason)

  if (!knownCategories.has(category)) return block('unknown-category')

  // Un libellé de salaire est toujours un nom d'employeur : donnée personnelle,
  // et sans valeur pour la communauté. Les organismes publics (CAF, France
  // Travail) sont déjà couverts par les packs.
  if (/^Salaire\b/i.test(category)) return block('employer')

  // IBAN : deux lettres, deux chiffres, puis une longue suite alphanumérique.
  if (/[A-Z]{2}\d{2}[A-Z0-9]{8,}/i.test(pattern)) return block('account-number')

  if (hasAccountReference(pattern)) return block('account-reference')

  if (/(^|[^A-Z])(M|MR|MME|MLLE|MADAME|MONSIEUR|MELLE)[\s.]/i.test(pattern)) {
    return block('civility')
  }

  const tokens = literalTokens(pattern)
  if (tokens.length === 0) return block('too-short')

  // L'allowlist se teste sur le contenu littéral, pas sur la regex brute : dans
  // « \bG7\b », les limites de mot collent au nom et empêcheraient toute
  // correspondance. Une enseigne reconnue lève tous les refus suivants.
  const literalText = tokens.join(' ')
  if (BRAND_ALLOWLIST.some((re) => re.test(literalText))) return { verdict: 'ok' }

  const normalized = tokens.map(normalize)
  const signals = personSignals(tokens, normalized)

  // Refus fermes : l'utilisateur a lui-même qualifié l'opération de privée, ou
  // deux indices concordants désignent une personne.
  if (signals.privacy) return block('privacy-marker')
  if (signals.familial) return block('personal-name')
  // Crédits, assurances, parts sociales : ces libellés décrivent un contrat de
  // l'utilisateur — souvent avec sa banque et son agence nommées — et n'ont
  // aucune valeur dans un pack communautaire.
  if (normalized.some((t) => ACCOUNT_OPERATION_TOKENS.has(t))) return block('account-operation')
  if (signals.transfer && (signals.forename || signals.initial)) return block('personal-name')
  if (signals.forename && tokens.length === 2) return block('personal-name')

  // Les chiffres se jugent sur le littéral : ceux d'un quantificateur « {0,20} »
  // relèvent de la syntaxe regex, pas d'un numéro de compte ou de carte.
  if (/\d/.test(literalText)) return block('contains-digits')

  // Un pattern uniquement composé de mots génériques ne désigne aucun marchand.
  if (normalized.every((t) => GENERIC_TOKENS.has(t))) return block('too-generic')

  const longest = Math.max(...tokens.map((t) => t.length))
  if (longest < MIN_LITERAL_LENGTH) return block('too-short')

  // Indice unique : trop faible pour refuser, trop fort pour cocher d'office.
  // C'est ici qu'atterrissent les noms qu'aucune liste ne connaît.
  if (signals.transfer) return review('transfer')
  if (signals.initial) return review('initial')
  if (signals.titleCase) return review('name-shape')
  if (signals.forename) return review('personal-name')

  return { verdict: 'ok' }
}

/** Une règle de la file de partage, avec le motif éventuel de son classement. */
export interface ShareEntry {
  id: number
  pattern: string
  category: string
  reason?: ShareRejectionReason
  detail?: string
}

export interface SharePartition {
  /** Publiables sans réserve — cochées par défaut. */
  candidates: ShareEntry[]
  /** Doute : proposées mais DÉCOCHÉES, l'utilisateur doit les valider. */
  review: ShareEntry[]
  /** Jamais proposées. */
  rejected: ShareEntry[]
}

/**
 * Répartit les règles utilisateur entre les trois listes.
 * Les règles issues d'un pack et celles déjà proposées sont ignorées
 * silencieusement : elles n'ont pas à figurer dans le rapport.
 */
export function partitionForSharing(
  rules: { id: number; pattern: string; category: string; source: string }[],
  knownCategories: Set<string>,
  alreadyShared: Set<string>
): SharePartition {
  const partition: SharePartition = { candidates: [], review: [], rejected: [] }

  for (const rule of rules) {
    if (rule.source !== 'user') continue
    if (alreadyShared.has(rule.pattern)) continue

    const result = analyzeShareability(rule.pattern, rule.category, knownCategories)
    const entry: ShareEntry = {
      id: rule.id,
      pattern: rule.pattern,
      category: rule.category,
      reason: result.reason,
      detail: result.detail
    }

    if (result.verdict === 'ok') partition.candidates.push(entry)
    else if (result.verdict === 'review') partition.review.push(entry)
    else partition.rejected.push(entry)
  }

  return partition
}
