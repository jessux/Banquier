import { z } from 'zod'

/**
 * Packs de catégories et de règles automatiques.
 *
 * Un pack est un lot versionné de catégories + règles regex, distribué soit en
 * interne (packs intégrés, voir BUILTIN_PACKS), soit via le dépôt communautaire
 * `banquier-rules`. Les packs sont installés dans les mêmes tables que les
 * règles utilisateur, distingués par `category_rules.source` :
 *
 *   source = 'user'          → créée à la main, jamais touchée par un pack
 *   source = 'pack:<id>'     → appartient au pack <id>, remplacée à chaque mise à jour
 *
 * L'application des règles est un premier-arrivé-premier-servi
 * (voir applyRulesToTransactions) : `priority` croissante d'abord, puis `id`.
 * Les règles utilisateur ont la priorité 0, donc elles gagnent toujours contre
 * un pack — sans quoi une mise à jour de pack écraserait silencieusement le
 * travail manuel de l'utilisateur.
 */

/** Priorité des règles saisies par l'utilisateur. Toujours la plus forte. */
export const USER_RULE_PRIORITY = 0

/** Priorité par défaut d'un pack, si `priority` n'est pas déclarée. */
export const DEFAULT_PACK_PRIORITY = 100

/** Au-delà, une regex devient difficile à relire et à auditer en revue de PR. */
export const MAX_PATTERN_LENGTH = 200

/** Séparateur des chemins de catégorie, aligné sur getCategoryPaths(). */
export const CATEGORY_PATH_SEPARATOR = ' > '

// --- Schémas ---

const patternSchema = z.string().min(2).max(MAX_PATTERN_LENGTH)

export const rulePackRuleSchema = z.object({
  pattern: patternSchema,
  /** Chemin de catégorie : « Alimentation » ou « Alimentation > Épicerie ». */
  category: z.string().min(1),
  /** Marque la transaction comme mouvement interne (exclue des totaux de dépenses). */
  internal: z.boolean().default(false),
  /** Libellés réels (anonymisés) que la règle doit attraper. Servent de tests en CI. */
  examples: z.array(z.string()).optional()
})

export const rulePackCategorySchema = z.object({
  name: z.string().min(1),
  children: z.array(z.string().min(1)).optional()
})

export const rulePackSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id : minuscules, chiffres et tirets uniquement'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version : semver x.y.z'),
  name: z.string().min(1),
  description: z.string().default(''),
  locale: z.string().min(2),
  license: z.string().default('CC0-1.0'),
  /** Plus le nombre est bas, plus le pack gagne face aux autres packs. */
  priority: z.number().int().min(1).max(9999).default(DEFAULT_PACK_PRIORITY),
  categories: z.array(rulePackCategorySchema).default([]),
  rules: z.array(rulePackRuleSchema).min(1)
})

export type RulePackRule = z.infer<typeof rulePackRuleSchema>
export type RulePackCategory = z.infer<typeof rulePackCategorySchema>
export type RulePack = z.infer<typeof rulePackSchema>

/** Forme d'une règle avant application des valeurs par défaut du schéma
 *  (`internal` notamment) — c'est ce qu'écrit un contributeur dans un JSON. */
export type RulePackRuleInput = z.input<typeof rulePackRuleSchema>

export const rulePackIndexSchema = z.object({
  formatVersion: z.literal(1),
  packs: z.array(
    z.object({
      id: z.string(),
      version: z.string(),
      name: z.string(),
      description: z.string().default(''),
      locale: z.string(),
      ruleCount: z.number().int().nonnegative().default(0),
      /** Chemin relatif à la racine du dépôt, résolu contre l'URL du catalogue. */
      path: z.string()
    })
  )
})

export type RulePackIndex = z.infer<typeof rulePackIndexSchema>
export type RulePackIndexEntry = RulePackIndex['packs'][number]

/** Réponse de window.api.getRulePackCatalog(), identique dans les deux runtimes. */
export interface RulePackCatalogResult {
  entries: PackCatalogEntry[]
  /** Renseigné si le dépôt distant est injoignable — les packs intégrés restent utilisables. */
  remoteError: string | null
}

/** Un pack tel qu'enregistré localement. */
export interface InstalledPack {
  id: string
  version: string
  name: string
  installed_at: string
  rule_count: number
}

/** Ce que l'utilisateur voit dans la page Packs : catalogue + état local. */
export interface PackCatalogEntry {
  id: string
  name: string
  description: string
  locale: string
  version: string
  ruleCount: number
  /** Version installée, null si le pack n'est pas installé. */
  installedVersion: string | null
  /** true si le pack est embarqué dans l'app (pas de réseau nécessaire). */
  builtin: boolean
}

// --- Sûreté des regex ---

export interface PatternSafety {
  safe: boolean
  reason?: string
}

interface QuantifierRead {
  found: boolean
  /** `*`, `+` et `{n,}` peuvent boucler sans borne — c'est ce qui fait exploser le backtracking. */
  unbounded: boolean
  next: number
}

function readQuantifier(pattern: string, start: number): QuantifierRead {
  const none: QuantifierRead = { found: false, unbounded: false, next: start }
  if (start >= pattern.length) return none
  const ch = pattern[start]

  let end: number
  let unbounded: boolean

  if (ch === '*' || ch === '+') {
    end = start + 1
    unbounded = true
  } else if (ch === '?') {
    end = start + 1
    unbounded = false
  } else if (ch === '{') {
    const close = pattern.indexOf('}', start)
    if (close === -1) return none
    const body = pattern.slice(start + 1, close)
    // `{` non suivi d'une borne valide est un littéral en JS, pas un quantificateur.
    if (!/^\d+(,\d*)?$/.test(body)) return none
    end = close + 1
    unbounded = /^\d+,$/.test(body)
  } else {
    return none
  }

  // Suffixe paresseux (`*?`) : consommé, sans effet sur le risque de backtracking.
  if (pattern[end] === '?') end++
  return { found: true, unbounded, next: end }
}

/**
 * Détecte une hauteur d'étoile > 1, c'est-à-dire un quantificateur non borné
 * appliqué à un groupe contenant lui-même un quantificateur : `(a+)+`, `(a?)*`,
 * `(\d{2,})+`… C'est la forme qui provoque un backtracking exponentiel (ReDoS).
 *
 * Heuristique volontairement stricte : elle refuse quelques regex en réalité
 * inoffensives. Sur un dépôt de règles communautaire, un faux positif coûte une
 * simplification de pattern en PR, un faux négatif fige l'app d'un utilisateur.
 */
function hasNestedQuantifier(pattern: string): boolean {
  const stack: { bodyHasQuantifier: boolean }[] = [{ bodyHasQuantifier: false }]
  let i = 0

  const markCurrent = (): void => {
    stack[stack.length - 1].bodyHasQuantifier = true
  }

  while (i < pattern.length) {
    const ch = pattern[i]

    if (ch === '\\') {
      i += 2
      const q = readQuantifier(pattern, i)
      if (q.found) {
        markCurrent()
        i = q.next
      }
      continue
    }

    if (ch === '[') {
      i++
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++
        i++
      }
      i++ // `]`
      const q = readQuantifier(pattern, i)
      if (q.found) {
        markCurrent()
        i = q.next
      }
      continue
    }

    if (ch === '(') {
      i++
      // Préfixes de groupe : (?: (?= (?! (?<= (?<! (?<nom>
      if (pattern[i] === '?') {
        i++
        if (pattern[i] === '<' && pattern[i + 1] !== '=' && pattern[i + 1] !== '!') {
          const close = pattern.indexOf('>', i)
          i = close === -1 ? i + 1 : close + 1
        } else if (pattern[i] === '<') {
          i += 2
        } else {
          i++
        }
      }
      stack.push({ bodyHasQuantifier: false })
      continue
    }

    if (ch === ')') {
      const frame = stack.pop() ?? { bodyHasQuantifier: false }
      i++
      const q = readQuantifier(pattern, i)
      if (q.found) {
        i = q.next
        if (q.unbounded && frame.bodyHasQuantifier) return true
        markCurrent()
      } else if (frame.bodyHasQuantifier) {
        // Un groupe non quantifié propage quand même son quantificateur interne :
        // dans `((a+))+`, le `+` externe porte sur un groupe imbriqué.
        markCurrent()
      }
      continue
    }

    i++
    const q = readQuantifier(pattern, i)
    if (q.found) {
      markCurrent()
      i = q.next
    }
  }

  return false
}

/**
 * Valide qu'un pattern peut être exécuté sans risque sur les libellés bancaires.
 * Appliqué à l'installation d'un pack ET en CI sur le dépôt communautaire.
 */
export function analyzePatternSafety(pattern: string): PatternSafety {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { safe: false, reason: `pattern trop long (${pattern.length} > ${MAX_PATTERN_LENGTH})` }
  }

  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'i')
  } catch (e) {
    return { safe: false, reason: `regex invalide : ${(e as Error).message}` }
  }

  // Une regex qui accepte la chaîne vide attrape toutes les transactions et
  // court-circuite toutes les règles suivantes.
  if (regex.test('')) {
    return { safe: false, reason: 'le pattern correspond à la chaîne vide (il attraperait tout)' }
  }

  if (hasNestedQuantifier(pattern)) {
    return { safe: false, reason: 'quantificateur imbriqué (risque de backtracking exponentiel)' }
  }

  return { safe: true }
}

// --- Validation d'un pack ---

export interface PackValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  pack: RulePack | null
}

/** Tous les chemins de catégorie déclarés par un pack, au format « Parent > Enfant ». */
export function categoryPathsOfPack(pack: Pick<RulePack, 'categories'>): string[] {
  const paths: string[] = []
  for (const cat of pack.categories) {
    paths.push(cat.name)
    for (const child of cat.children ?? []) {
      paths.push(`${cat.name}${CATEGORY_PATH_SEPARATOR}${child}`)
    }
  }
  return paths
}

export function validatePack(input: unknown): PackValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const parsed = rulePackSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '(racine)'} : ${issue.message}`)
    }
    return { valid: false, errors, warnings, pack: null }
  }

  const pack = parsed.data
  const known = new Set(categoryPathsOfPack(pack))
  const seen = new Set<string>()

  pack.rules.forEach((rule, index) => {
    const where = `rules[${index}] (${rule.pattern})`

    if (seen.has(rule.pattern)) {
      errors.push(`${where} : pattern dupliqué dans le pack`)
    }
    seen.add(rule.pattern)

    const safety = analyzePatternSafety(rule.pattern)
    if (!safety.safe) errors.push(`${where} : ${safety.reason}`)

    // Un pack qui déclare ses catégories doit être autonome : une règle pointant
    // hors de cet arbre créerait une catégorie fantôme absente du sélecteur.
    if (pack.categories.length > 0 && !known.has(rule.category)) {
      errors.push(`${where} : catégorie « ${rule.category} » absente de l'arbre du pack`)
    }

    if (safety.safe && rule.examples?.length) {
      const regex = new RegExp(rule.pattern, 'i')
      for (const example of rule.examples) {
        if (!regex.test(example)) {
          errors.push(`${where} : l'exemple « ${example} » n'est pas capturé par le pattern`)
        }
      }
    }

    if (!rule.examples?.length) {
      warnings.push(`${where} : aucun exemple fourni (non testable en CI)`)
    }
  })

  return { valid: errors.length === 0, errors, warnings, pack }
}

/**
 * Vérifie qu'aucune règle n'est masquée par une règle antérieure du même pack.
 * L'ordre du tableau `rules` EST la priorité interne du pack : une règle générique
 * placée trop haut rend inutiles toutes les règles spécifiques qui la suivent.
 */
export function findShadowedRules(pack: RulePack): { index: number; shadowedBy: number }[] {
  const shadowed: { index: number; shadowedBy: number }[] = []
  const compiled = pack.rules.map((r) => {
    try {
      return new RegExp(r.pattern, 'i')
    } catch {
      return null
    }
  })

  pack.rules.forEach((rule, index) => {
    for (const example of rule.examples ?? []) {
      for (let before = 0; before < index; before++) {
        const earlier = compiled[before]
        if (earlier?.test(example) && pack.rules[before].category !== rule.category) {
          shadowed.push({ index, shadowedBy: before })
          return
        }
      }
    }
  })

  return shadowed
}

// --- Pack intégré : fr-base ---

const FR_BASE_CATEGORIES: RulePackCategory[] = [
  { name: 'Alimentation', children: ['Épicerie', 'Boulangerie / Traiteur', 'Marchés'] },
  { name: 'Restaurants', children: ['Fast-food', 'Cafés', 'Livraison repas'] },
  { name: 'Transport', children: ['Carburant', 'Transports en commun', 'Taxi / VTC', 'Stationnement'] },
  { name: 'Logement', children: ['Loyer', 'Électricité / Gaz', 'Internet / Téléphone', 'Entretien'] },
  { name: 'Shopping', children: ['Vêtements', 'Électronique', 'Maison / Déco'] },
  { name: 'Santé', children: ['Médecin / Dentiste', 'Pharmacie', 'Mutuelle'] },
  { name: 'Loisirs', children: ['Cinéma / Spectacles', 'Sport', 'Jeux / Hobbies'] },
  { name: 'Abonnements', children: ['Streaming', 'Presse / Livres', 'Logiciels'] },
  { name: 'Voyages', children: ['Transports voyage', 'Hébergement', 'Activités touristiques'] },
  { name: 'Épargne', children: ['Virement épargne', 'Investissements'] },
  { name: 'Salaire' },
  { name: 'Revenus', children: ['Freelance / Auto-entrepreneur', 'Aides / CAF', 'Remboursements'] },
  { name: 'Frais bancaires' },
  { name: 'Virements internes' },
  { name: 'Autre' }
]

/**
 * Règles de départ pour les relevés bancaires français.
 *
 * L'ORDRE COMPTE : la première règle qui correspond gagne. Les enseignes dont le
 * nom est préfixe d'une autre doivent venir en premier (UBER EATS avant UBER).
 *
 * Principe de rédaction : mieux vaut ne pas catégoriser que catégoriser à tort.
 * Les libellés ambigus (TOTALENERGIES = fournisseur d'énergie ou station-service)
 * ne sont capturés que sous leur forme désambiguïsée.
 */
const FR_BASE_RULES: RulePackRuleInput[] = [
  // --- Cas ambigus, à traiter avant les règles générales ---
  {
    pattern: 'UBER\\s?EATS',
    category: 'Restaurants > Livraison repas',
    examples: ['CB UBER EATS 12/03', 'PAIEMENT CB UBEREATS']
  },
  {
    pattern: '(PRLV|PRELEVEMENT).{0,20}TOTAL\\s?ENERGIES|TOTAL\\s?ENERGIES\\s?(ELEC|GAZ)',
    category: 'Logement > Électricité / Gaz',
    examples: ['PRLV SEPA TOTALENERGIES ELECTRICITE', 'TOTALENERGIES GAZ']
  },
  {
    pattern: 'TOTAL\\s?ACCESS|STATION\\s?TOTAL',
    category: 'Transport > Carburant',
    examples: ['CB TOTAL ACCESS BORDEAUX', 'STATION TOTAL A10']
  },

  // --- Alimentation ---
  {
    pattern: 'CARREFOUR|LECLERC|INTERMARCHE|AUCHAN|\\bLIDL\\b|\\bALDI\\b|MONOPRIX|FRANPRIX|\\bCORA\\b|\\bNETTO\\b',
    category: 'Alimentation > Épicerie',
    examples: ['CB CARREFOUR MARKET 04/02', 'CB E.LECLERC MERIGNAC', 'CB LIDL 1234']
  },
  {
    pattern: 'SUPER\\s?U\\b|HYPER\\s?U\\b|\\bU EXPRESS\\b|G[EÉ]ANT CASINO|PETIT CASINO|CASINO SUPERMARCHE',
    category: 'Alimentation > Épicerie',
    examples: ['CB SUPER U LA TESTE', 'CB GEANT CASINO']
  },
  {
    pattern: 'GRAND FRAIS|BIOCOOP|NATURALIA|\\bPICARD\\b|LA VIE CLAIRE',
    category: 'Alimentation > Épicerie',
    examples: ['CB GRAND FRAIS', 'CB BIOCOOP TALENCE']
  },
  {
    pattern: 'BOULANGERIE|PATISSERIE|MARIE BLACHERE|\\bANGE\\b.{0,10}BOULANG',
    category: 'Alimentation > Boulangerie / Traiteur',
    examples: ['CB BOULANGERIE DUPONT', 'CB MARIE BLACHERE']
  },
  {
    pattern: 'MARCHE COUVERT|MARCHE DE |PRIMEUR|POISSONNERIE|BOUCHERIE|FROMAGERIE',
    category: 'Alimentation > Marchés',
    examples: ['CB BOUCHERIE CENTRALE', 'CB POISSONNERIE DU PORT']
  },

  // --- Restaurants ---
  {
    pattern: 'DELIVEROO|JUST\\s?EAT|\\bFRICHTI\\b',
    category: 'Restaurants > Livraison repas',
    examples: ['CB DELIVEROO PARIS', 'CB JUST EAT']
  },
  {
    pattern: 'MC\\s?DONALD|\\bMCDO\\b|BURGER KING|\\bKFC\\b|\\bQUICK\\b|SUBWAY|DOMINO.?S|PIZZA HUT|\\bO TACOS\\b',
    category: 'Restaurants > Fast-food',
    examples: ['CB MCDONALDS 4521', 'CB BURGER KING BORDEAUX']
  },
  {
    pattern: 'STARBUCKS|COLUMBUS CAFE|\\bCAFE\\b|BRASSERIE|\\bBAR\\b.{0,15}TABAC',
    category: 'Restaurants > Cafés',
    examples: ['CB STARBUCKS GARE', 'CB BRASSERIE LE SELECT']
  },
  {
    pattern: 'RESTAURANT|\\bRESTO\\b|\\bPIZZERIA\\b|\\bTRAITEUR\\b',
    category: 'Restaurants',
    examples: ['CB RESTAURANT LE JARDIN', 'CB PIZZERIA NAPOLI']
  },

  // --- Transport ---
  {
    pattern: '\\bESSO\\b|\\bSHELL\\b|\\bAVIA\\b|\\bAGIP\\b|STATION SERVICE|\\bCARBURANT\\b',
    category: 'Transport > Carburant',
    examples: ['CB ESSO EXPRESS', 'CB STATION SERVICE A63']
  },
  {
    pattern: '\\bSNCF\\b|\\bOUIGO\\b|TRAINLINE|\\bTGV\\b.{0,10}INOUI|\\bTER\\b\\s?(NOUVELLE|AUVERGNE|GRAND)',
    category: 'Transport > Transports en commun',
    examples: ['CB SNCF CONNECT', 'CB OUIGO 12345']
  },
  {
    pattern: '\\bRATP\\b|NAVIGO|\\bTISSEO\\b|\\bTBM\\b|\\bTCL\\b|\\bTAN\\b\\s|ILE DE FRANCE MOBILITES',
    category: 'Transport > Transports en commun',
    examples: ['PRLV NAVIGO ANNUEL', 'CB TBM BORDEAUX']
  },
  {
    pattern: '\\bUBER\\b|\\bBOLT\\b|FREE\\s?NOW|\\bG7\\b\\s?TAXI|\\bTAXI\\b',
    category: 'Transport > Taxi / VTC',
    examples: ['CB UBER BV', 'CB TAXI G7 PARIS']
  },
  {
    pattern: '\\bPARKING\\b|\\bINDIGO\\b\\s?PARK|\\bEFFIA\\b|\\bONEPARK\\b|HORODATEUR|\\bPARCUB\\b',
    category: 'Transport > Stationnement',
    examples: ['CB PARKING GARE', 'CB EFFIA STATIONNEMENT']
  },
  {
    pattern: '\\bVINCI\\b\\s?AUTOROUTE|\\bASF\\b\\s|\\bCOFIROUTE\\b|\\bSANEF\\b|\\bAPRR\\b|\\bPEAGE\\b',
    category: 'Transport',
    examples: ['CB VINCI AUTOROUTES', 'CB PEAGE A10']
  },

  // --- Logement ---
  {
    pattern: '\\bLOYER\\b|QUITTANCE|\\bSCI\\b\\s|AGENCE IMMOBILIERE|FONCIA|CITYA|NEXITY',
    category: 'Logement > Loyer',
    examples: ['VIR SEPA LOYER MARS', 'PRLV FONCIA']
  },
  {
    pattern: '\\bEDF\\b|\\bENGIE\\b|\\bEKWATEER\\b|EKWATEUR|MINT ENERGIE|OHM ENERGIE|PLANETE OUI',
    category: 'Logement > Électricité / Gaz',
    examples: ['PRLV SEPA EDF', 'PRLV ENGIE GAZ']
  },
  {
    pattern: '\\bVEOLIA\\b|\\bSUEZ\\b|\\bSAUR\\b|EAU DE PARIS|SERVICE DES EAUX',
    category: 'Logement > Entretien',
    examples: ['PRLV VEOLIA EAU', 'PRLV SAUR']
  },
  {
    pattern: '\\bORANGE\\b|\\bSOSH\\b|\\bSFR\\b|RED BY SFR|BOUYGUES\\s?TELECOM|\\bBBOX\\b|FREE MOBILE|FREE TELECOM|\\bB&YOU\\b',
    category: 'Logement > Internet / Téléphone',
    examples: ['PRLV ORANGE FRANCE', 'PRLV FREE MOBILE', 'PRLV SFR FIBRE']
  },

  // --- Shopping ---
  {
    pattern: '\\bZARA\\b|\\bH&M\\b|\\bHetM\\b|UNIQLO|\\bKIABI\\b|\\bJULES\\b|\\bCELIO\\b|PRIMARK|\\bGEMO\\b|CHAUSSEA',
    category: 'Shopping > Vêtements',
    examples: ['CB ZARA FRANCE', 'CB KIABI MERIGNAC']
  },
  {
    pattern: '\\bFNAC\\b|\\bDARTY\\b|BOULANGER|\\bLDLC\\b|\\bMATERIEL\\.NET\\b|\\bRUE DU COMMERCE\\b',
    category: 'Shopping > Électronique',
    examples: ['CB FNAC BORDEAUX', 'CB DARTY 1234']
  },
  {
    pattern: '\\bIKEA\\b|LEROY MERLIN|CASTORAMA|\\bBRICO\\b|\\bMAISONS DU MONDE\\b|\\bACTION\\b|\\bGIFI\\b|\\bZODIO\\b',
    category: 'Shopping > Maison / Déco',
    examples: ['CB IKEA BORDEAUX', 'CB LEROY MERLIN', 'CB ACTION 456']
  },
  {
    pattern: '\\bAMAZON\\b|\\bAMZN\\b|CDISCOUNT|\\bVEEPEE\\b|\\bSHEIN\\b|\\bTEMU\\b|\\bVINTED\\b|\\bETSY\\b|\\bALIEXPRESS\\b',
    category: 'Shopping',
    examples: ['CB AMAZON EU SARL', 'CB CDISCOUNT', 'CB VINTED']
  },
  {
    pattern: 'DECATHLON|\\bINTERSPORT\\b|\\bGO SPORT\\b|\\bNIKE\\b|\\bADIDAS\\b',
    category: 'Shopping > Vêtements',
    examples: ['CB DECATHLON MERIGNAC']
  },

  // --- Santé ---
  {
    pattern: 'PHARMACIE|\\bPHARMA\\b',
    category: 'Santé > Pharmacie',
    examples: ['CB PHARMACIE DU CENTRE']
  },
  {
    pattern: 'DOCTOLIB|CABINET MEDICAL|\\bDOCTEUR\\b|\\bDENTISTE\\b|\\bDENTAIRE\\b|LABORATOIRE.{0,15}ANALYSE|\\bRADIOLOGIE\\b|\\bKINE\\b',
    category: 'Santé > Médecin / Dentiste',
    examples: ['CB DOCTOLIB', 'CB CABINET DENTAIRE']
  },
  {
    pattern: '\\bMUTUELLE\\b|HARMONIE MUTUELLE|\\bMGEN\\b|\\bMAAF\\b\\s?SANTE|\\bMACIF\\b\\s?SANTE|\\bAPRIL\\b|ALAN\\s?SA',
    category: 'Santé > Mutuelle',
    examples: ['PRLV HARMONIE MUTUELLE', 'PRLV MGEN']
  },
  {
    pattern: '\\bCPAM\\b|ASSURANCE MALADIE|\\bAMELI\\b',
    category: 'Revenus > Remboursements',
    examples: ['VIR CPAM GIRONDE', 'VIR SEPA ASSURANCE MALADIE']
  },

  // --- Loisirs ---
  {
    pattern: '\\bUGC\\b|\\bPATHE\\b|GAUMONT|\\bCGR\\b|KINEPOLIS|\\bMK2\\b|\\bTHEATRE\\b|FNAC SPECTACLES|\\bTICKETMASTER\\b',
    category: 'Loisirs > Cinéma / Spectacles',
    examples: ['CB UGC CINE CITE', 'CB PATHE BORDEAUX']
  },
  {
    pattern: 'BASIC\\s?FIT|FITNESS PARK|\\bKEEPCOOL\\b|\\bNEONESS\\b|SALLE DE SPORT|\\bPISCINE\\b',
    category: 'Loisirs > Sport',
    examples: ['PRLV BASIC FIT', 'PRLV FITNESS PARK']
  },
  {
    pattern: 'MICROMANIA|\\bSTEAM\\b\\s?GAMES|STEAMGAMES|\\bNINTENDO\\b|PLAYSTATION|XBOX\\s?LIVE',
    category: 'Loisirs > Jeux / Hobbies',
    examples: ['CB STEAMGAMES.COM', 'CB NINTENDO ESHOP']
  },

  // --- Abonnements ---
  {
    pattern: 'NETFLIX|SPOTIFY|\\bDEEZER\\b|DISNEY\\s?PLUS|\\bCANAL\\+|CANAL PLUS|PRIME VIDEO|YOUTUBE\\s?PREMIUM|\\bMOLOTOV\\b',
    category: 'Abonnements > Streaming',
    examples: ['CB NETFLIX.COM', 'PRLV SPOTIFY AB']
  },
  {
    pattern: 'ADOBE|MICROSOFT\\s?365|\\bOVH\\b|\\bGANDI\\b|\\bICLOUD\\b|GOOGLE\\s?(ONE|STORAGE)|\\bDROPBOX\\b|\\bNOTION\\b|\\bGITHUB\\b',
    category: 'Abonnements > Logiciels',
    examples: ['CB ADOBE SYSTEMS', 'CB GITHUB.COM']
  },
  {
    pattern: 'LE MONDE|\\bMEDIAPART\\b|SUD OUEST|\\bTELERAMA\\b|\\bLIBERATION\\b|\\bKINDLE\\b|\\bAUDIBLE\\b',
    category: 'Abonnements > Presse / Livres',
    examples: ['PRLV LE MONDE ABO', 'CB MEDIAPART']
  },

  // --- Voyages ---
  {
    pattern: 'AIR FRANCE|\\bRYANAIR\\b|EASYJET|TRANSAVIA|\\bVUELING\\b|\\bLUFTHANSA\\b|\\bFLIXBUS\\b|BLABLACAR',
    category: 'Voyages > Transports voyage',
    examples: ['CB AIR FRANCE', 'CB RYANAIR DUBLIN']
  },
  {
    pattern: 'BOOKING\\.?COM|AIRBNB|\\bABRITEL\\b|\\bHOTEL\\b|\\bIBIS\\b|\\bCAMPANILE\\b|\\bMERCURE\\b',
    category: 'Voyages > Hébergement',
    examples: ['CB BOOKING.COM', 'CB AIRBNB PAYMENTS']
  },
  {
    pattern: '\\bHERTZ\\b|EUROPCAR|\\bSIXT\\b|\\bAVIS\\b\\s?LOCATION|RENT\\s?A\\s?CAR',
    category: 'Voyages > Activités touristiques',
    examples: ['CB EUROPCAR BORDEAUX']
  },

  // --- Épargne et investissement ---
  {
    pattern: 'LIVRET\\s?A\\b|\\bLDDS\\b|\\bLEP\\b\\s|LIVRET JEUNE|\\bPEL\\b\\s|VIR.{0,15}EPARGNE',
    category: 'Épargne > Virement épargne',
    examples: ['VIR VERS LIVRET A', 'VIR SEPA EPARGNE MENSUELLE']
  },
  {
    pattern: 'TRADE REPUBLIC|BOURSORAMA.{0,10}(PEA|CTO)|\\bDEGIRO\\b|\\bYOMONI\\b|\\bLINXEA\\b|\\bNALO\\b|\\bRAMIFY\\b|\\bCOINBASE\\b|\\bKRAKEN\\b|\\bBINANCE\\b',
    category: 'Épargne > Investissements',
    examples: ['VIR TRADE REPUBLIC', 'CB COINBASE']
  },

  // --- Revenus ---
  {
    pattern: '\\bSALAIRE\\b|\\bPAIE\\b\\s|REMUNERATION|VIR.{0,10}SALAIRE',
    category: 'Salaire',
    examples: ['VIR SEPA SALAIRE JANVIER', 'VIR SALAIRE ACME SAS']
  },
  {
    pattern: '\\bCAF\\b\\s|CAISSE ALLOC|POLE EMPLOI|FRANCE TRAVAIL|\\bAPL\\b\\s|PRIME ACTIVITE',
    category: 'Revenus > Aides / CAF',
    examples: ['VIR CAF GIRONDE', 'VIR FRANCE TRAVAIL']
  },
  {
    pattern: 'REMBOURSEMENT|\\bRBT\\b\\s|\\bAVOIR\\b\\s',
    category: 'Revenus > Remboursements',
    examples: ['VIR REMBOURSEMENT FRAIS']
  },

  // --- Frais bancaires ---
  {
    pattern: 'COTISATION.{0,20}(CARTE|COMPTE|BANCAIRE)|FRAIS.{0,15}(TENUE|COMPTE|BANCAIRE|IRREGULARITE)|\\bAGIOS\\b|COMMISSION.{0,15}INTERVENTION',
    category: 'Frais bancaires',
    examples: ['COTISATION CARTE VISA', 'FRAIS DE TENUE DE COMPTE', 'AGIOS TRIMESTRIELS']
  },

  // --- Virements internes ---
  {
    pattern: 'VIREMENT INTERNE|VIR.{0,10}INTERNE|TRANSFERT.{0,15}COMPTE',
    category: 'Virements internes',
    internal: true,
    examples: ['VIREMENT INTERNE VERS LIVRET', 'VIR INTERNE COMPTE JOINT']
  }
]

export const FR_BASE_PACK: RulePack = rulePackSchema.parse({
  id: 'fr-base',
  version: '1.0.0',
  name: 'France — base',
  description:
    'Arbre de catégories et règles de départ pour les relevés bancaires français : ' +
    'grandes enseignes, opérateurs, transports, abonnements et frais bancaires.',
  locale: 'fr-FR',
  license: 'CC0-1.0',
  priority: DEFAULT_PACK_PRIORITY,
  categories: FR_BASE_CATEGORIES,
  rules: FR_BASE_RULES
})

/** Packs embarqués dans l'application, installables sans réseau. */
export const BUILTIN_PACKS: RulePack[] = [FR_BASE_PACK]

/** Arbre de catégories utilisé pour amorcer une base vierge. */
export const DEFAULT_CATEGORY_TREE: RulePackCategory[] = FR_BASE_CATEGORIES

export function getBuiltinPack(id: string): RulePack | undefined {
  return BUILTIN_PACKS.find((p) => p.id === id)
}

/**
 * Décide si une catégorie désigne un mouvement interne (virement entre comptes
 * du même utilisateur), qui ne doit pas compter comme une dépense.
 *
 * Le moteur testait auparavant `category.includes('intern')`, ce qui capturait
 * « Logement > Internet / Téléphone » et sortait à tort les factures internet
 * des totaux. On exige désormais le mot entier : « interne » / « internes »
 * correspondent, « internet » et « international » non.
 */
export function looksLikeInternalCategory(category: string): boolean {
  return /\binternes?\b/i.test(category)
}

/** `category_rules.source` correspondant à un pack. */
export function packSource(packId: string): string {
  return `pack:${packId}`
}

/** Inverse de packSource(), null pour les règles utilisateur. */
export function packIdFromSource(source: string): string | null {
  return source.startsWith('pack:') ? source.slice('pack:'.length) : null
}

/** Compare deux versions semver. Retourne > 0 si `a` est plus récente que `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
