import { describe, expect, it } from 'vitest'
import { analyzeShareability, partitionForSharing } from './ruleSharing'
import { categoryPathsOfPack, FR_BASE_PACK } from './rulePacks'

const KNOWN = new Set(categoryPathsOfPack(FR_BASE_PACK))

const check = (pattern: string, category = 'Alimentation > Épicerie'): ReturnType<typeof analyzeShareability> =>
  analyzeShareability(pattern, category, KNOWN)

describe('analyzeShareability — données personnelles', () => {
  it('écarte la forme prénom + nom', () => {
    expect(check('JEAN DUPONT')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
    expect(check('CAMILLE MARTIN')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
  })

  it('écarte un prénom accompagné d’un marqueur de virement', () => {
    expect(check('VIR SOPHIE')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
    expect(check('VIR SEPA SOPHIE LEROY')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
  })

  it('écarte les termes familiaux', () => {
    expect(check('VIR PAPA')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
    expect(check('MAMIE')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
  })

  it('reconnaît les prénoms accentués', () => {
    expect(check('CÉLINE DUBOIS')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
    expect(check('JÉRÔME LEROY')).toMatchObject({ verdict: 'blocked', reason: 'personal-name' })
  })

  it('laisse passer un prénom seul — c’est le plus souvent une enseigne', () => {
    // Refuser tout prénom écartait la majorité des règles légitimes : Paul,
    // Nicolas et Jules sont des chaînes de magasins. Sans nom de famille ni
    // marqueur de virement, on accepte.
    for (const pattern of ['PAUL', 'NICOLAS', 'JULES', 'ANDRE']) {
      expect(check(pattern), pattern).toMatchObject({ verdict: 'ok' })
    }
  })

  it('écarte les civilités', () => {
    expect(check('M DUPONT')).toMatchObject({ verdict: 'blocked', reason: 'civility' })
    expect(check('MME MARTIN')).toMatchObject({ verdict: 'blocked', reason: 'civility' })
    expect(check('LOYER MLLE BERNARD')).toMatchObject({ verdict: 'blocked', reason: 'civility' })
  })

  it('ne confond pas une civilité avec une fin de mot', () => {
    // « PHARMACIE » se termine par « IE », « INTERIM » contient « M » — aucun
    // ne doit déclencher la règle des civilités.
    expect(check('PHARMACIE', 'Santé > Pharmacie')).toMatchObject({ verdict: 'ok' })
  })

  it('écarte un IBAN', () => {
    expect(check('FR7630001007941234567890185')).toMatchObject({
      verdict: 'blocked',
      reason: 'account-number'
    })
  })

  it('écarte tout pattern contenant des chiffres', () => {
    expect(check('CARREFOUR 4521')).toMatchObject({ verdict: 'blocked', reason: 'contains-digits' })
    expect(check('VIR 06 12 34 56 78')).toMatchObject({ verdict: 'blocked', reason: 'contains-digits' })
  })

  it('tolère les marques dont le nom comporte un chiffre', () => {
    expect(analyzeShareability('\\bG7\\b', 'Transport > Taxi / VTC', KNOWN)).toMatchObject({
      verdict: 'ok'
    })
  })
})

describe('analyzeShareability — qualité', () => {
  it('écarte les patterns trop courts', () => {
    expect(check('AB')).toMatchObject({ verdict: 'blocked', reason: 'too-short' })
    expect(check('\\bXY\\b')).toMatchObject({ verdict: 'blocked', reason: 'too-short' })
  })

  it('écarte les mots purement génériques', () => {
    expect(check('VIREMENT')).toMatchObject({ verdict: 'blocked', reason: 'too-generic' })
    expect(check('PRELEVEMENT|PRLV')).toMatchObject({ verdict: 'blocked', reason: 'too-generic' })
  })

  it('accepte un générique combiné à un marchand', () => {
    expect(check('PRLV CARREFOUR BANQUE', 'Frais bancaires')).toMatchObject({ verdict: 'ok' })
  })

  it('écarte une catégorie personnelle absente des packs', () => {
    expect(check('CARREFOUR', 'Pension alimentaire Julie')).toMatchObject({
      verdict: 'blocked',
      reason: 'unknown-category'
    })
  })

  it('accepte un vrai nom d’enseigne', () => {
    for (const pattern of ['BOULANGERIE ANGE', 'CULTURA', '\\bNORMAL\\b', 'GRAND OPTICAL']) {
      expect(check(pattern), pattern).toMatchObject({ verdict: 'ok' })
    }
  })
})

/**
 * Corpus de non-régression sur le taux de faux positifs.
 *
 * Une première version du filtre écartait 19 de ces 33 enseignes : tout pattern
 * contenant un prénom, tout sigle de moins de quatre lettres, et tout
 * quantificateur regex pris pour un numéro. Le filtre n'a de valeur que s'il
 * laisse passer les règles légitimes.
 */
describe('corpus — enseignes réelles', () => {
  const BRANDS = [
    // Enseignes dont le nom est aussi un prénom
    'PAUL', 'NICOLAS', 'JULES', 'ANDRE', 'MARIE BLACHERE', 'LA VIE CLAIRE',
    'ALAIN AFFLELOU', 'YVES ROCHER', 'LOUIS VUITTON', 'MICHEL ET AUGUSTIN',
    'SAINT MACLOU', 'CAMAIEU', 'CLAIRE FONTAINE',
    // Sigles courts
    'EDF', 'SFR', 'KFC', 'UGC', 'BUT', 'GAP', 'FNAC', 'IKEA', 'H&M',
    // Patterns avec syntaxe regex
    'CARREFOUR.{0,10}MARKET', 'PRLV.{0,20}ORANGE', 'CB[ -]?DECATHLON',
    '\\bLIDL\\b', 'BOULANGERIE|PATISSERIE', 'AMAZON|AMZN',
    // Enseignes ordinaires
    'CULTURA', 'GRAND OPTICAL', 'LEROY MERLIN', 'BASIC FIT', 'TRADE REPUBLIC'
  ]

  it.each(BRANDS)('accepte « %s »', (pattern) => {
    expect(check(pattern)).toMatchObject({ verdict: 'ok' })
  })
})

describe('corpus — données personnelles', () => {
  const PERSONAL = [
    'JEAN DUPONT',
    'VIR PAPA',
    'M MARTIN',
    'MME BERNARD',
    'VIR SEPA SOPHIE LEROY',
    'FR7630001007941234567890185',
    'VIREMENT',
    'CARREFOUR 4521',
    'REMB THOMAS PETIT'
  ]

  it.each(PERSONAL)('écarte « %s »', (pattern) => {
    expect(check(pattern)).toMatchObject({ verdict: 'blocked' })
  })
})

/**
 * Libellés de néobanque signalés en usage réel : « To José Marques Perso
 * Cadeau » et « To MARJORIE K » apparaissaient comme prêts à être partagés.
 * Ni « José » ni « Marjorie » ne figuraient dans la liste de prénoms, et les
 * préfixes anglais « To » / « From » n'étaient pas reconnus.
 */
describe('régression — libellés de virement néobanque', () => {
  it('bloque un virement nominatif marqué « Perso »', () => {
    expect(check('To José Marques Perso Cadeau', 'Autre')).toMatchObject({
      verdict: 'blocked',
      reason: 'privacy-marker'
    })
  })

  it('bloque un destinataire suivi d’une initiale', () => {
    expect(check('To MARJORIE K', 'Autre')).toMatchObject({
      verdict: 'blocked',
      reason: 'personal-name'
    })
  })

  it('bloque les préfixes directionnels devant un prénom connu', () => {
    expect(check('From Marie', 'Autre')).toMatchObject({ verdict: 'blocked' })
    expect(check('Vers Thomas', 'Autre')).toMatchObject({ verdict: 'blocked' })
  })
})

describe('verdict « à vérifier »', () => {
  it('n’auto-coche jamais un nom inconnu des listes', () => {
    // C'est la garantie qui rend le filtre robuste : « José Marques » n'est dans
    // aucune liste, mais sa forme suffit à le sortir des cases pré-cochées.
    expect(check('José Marques', 'Autre')).toMatchObject({
      verdict: 'review',
      reason: 'name-shape'
    })
  })

  it('laisse le virement vers un marchand décidable par l’utilisateur', () => {
    // « To Uber Eats » est un vrai marchand : on ne le bloque pas, on demande.
    expect(check('To Uber Eats', 'Autre')).toMatchObject({ verdict: 'review', reason: 'transfer' })
  })

  it('classe les règles à vérifier hors des candidates', () => {
    const { candidates, review } = partitionForSharing(
      [{ id: 1, pattern: 'José Marques', category: 'Autre', source: 'user' }],
      KNOWN,
      new Set()
    )
    expect(candidates).toEqual([])
    expect(review.map((r) => r.pattern)).toEqual(['José Marques'])
  })
})

/**
 * Corpus tiré d'une proposition réelle de 40 règles, publiée avant correction.
 * Les 40 étaient passées : le référentiel de catégories venait de l'arbre de
 * l'utilisateur au lieu des packs, et le filtre ne cherchait que des noms de
 * personnes — pas les libellés institutionnels.
 */
describe('régression — libellés bancaires institutionnels', () => {
  it('bloque un libellé de salaire : c’est le nom de l’employeur', () => {
    expect(
      analyzeShareability('GROUPAMA SUPPORTS ET SERVICES VI VIRT\\.APTS', 'Salaire', KNOWN)
    ).toMatchObject({ verdict: 'blocked', reason: 'employer' })
  })

  it('bloque les identifiants créanciers SEPA et références de contrat', () => {
    for (const pattern of [
      'CESML electricite EC\\d+ EC\\d+ CESMLIC\\d+ FR\\d+ZZZ\\d+',
      'SANTANDER CONSUMER BANQUE CTTO\\.: \\d+ZCL\\d+ EFECTO: \\d+ FR\\d+ZZZ\\d+',
      'BipAndGo BipAndGo/PI\\d+-\\d+/SLMP\\d+',
      '\\d+ \\d+/\\d+/\\d+ CAPITAL'
    ]) {
      expect(check(pattern, 'Autre'), pattern).toMatchObject({ verdict: 'blocked' })
    }
  })

  it('limite connue : un marchand suivi d’un magasin précis passe', () => {
    // « X\d+ YVES ROCHER ST CLEME » était bloqué quand une seule lettre collée
    // à \d suffisait — au prix de refuser tout masque de carte. Le suffixe
    // « ST CLEME » reste un indice de localisation qu'aucune heuristique ne
    // distingue d'un nom d'enseigne : c'est au relecteur de l'écarter.
    expect(check('X\\d+ YVES ROCHER ST CLEME', 'Autre')).toMatchObject({ verdict: 'ok' })
  })

  it('bloque les opérations de compte, qui nomment la banque et l’agence', () => {
    for (const pattern of [
      'SOUSCRIPTION P\\.SOC\\.LA MOSSON',
      'SION PS CR - P\\.SOC\\.LA MOSSON',
      'INTERETS CREDITEURS P\\.SOC\\.LA MOSSON',
      'COUPON - P\\.SOC\\.LA MOSSON',
      'REGLEMENT ASSU\\. CAAE PRET HABITAT \\d+/\\d+'
    ]) {
      expect(check(pattern, 'Autre'), pattern).toMatchObject({ verdict: 'blocked' })
    }
  })

  it('sépare les mots soudés par une ponctuation échappée', () => {
    // « P\.SOC\.LA » donnait le token « PSOCLA » : le marqueur « SOC » était
    // invisible et la règle passait.
    expect(check('SION PS CR - P\\.SOC\\.LA MOSSON', 'Autre')).toMatchObject({
      verdict: 'blocked',
      reason: 'account-operation'
    })
  })

  it('laisse passer un \\d isolé, qui vise bien l’enseigne', () => {
    for (const pattern of ['Action \\d+', 'Decathlon \\d+', 'Orchestra \\d+']) {
      expect(check(pattern, 'Shopping'), pattern).toMatchObject({ verdict: 'ok' })
    }
  })

  it('laisse passer un masque de carte devant un marchand', () => {
    // « CARTE X\d+ » masque les derniers chiffres de la carte : les chiffres
    // sont déjà génériques, et le « X » ne doit pas être pris pour une initiale
    // de nom de famille. Un identifiant créancier porte au moins deux lettres.
    for (const pattern of ['AVOIR CARTE X\\d+ AMAZON PAYMENT', 'CARTE X\\d+ FNAC']) {
      expect(check(pattern, 'Shopping'), pattern).toMatchObject({ verdict: 'ok' })
    }
  })

  it('ne voit pas un virement dans « PAYMENT »', () => {
    // Le mot abonde dans les descripteurs marchands et ne dit rien du
    // bénéficiaire ; « to » en tête ou en deuxième position, si.
    expect(check('AMAZON PAYMENT', 'Shopping')).toMatchObject({ verdict: 'ok' })
    expect(check('PAYPAL PAYMENT', 'Shopping')).toMatchObject({ verdict: 'ok' })
    expect(check('Payment to Marie', 'Autre')).toMatchObject({ verdict: 'blocked' })
  })

  it('laisse passer les marchands ordinaires du même lot', () => {
    for (const pattern of ['Gifi', 'Castorama', 'Cloudflare', 'Anthropic', 'Spar', 'Gemo']) {
      expect(check(pattern, 'Shopping'), pattern).toMatchObject({ verdict: 'ok' })
    }
  })
})

describe('partitionForSharing', () => {
  const rules = [
    { id: 1, pattern: 'CULTURA', category: 'Loisirs', source: 'user' },
    { id: 2, pattern: 'VIR PAPA', category: 'Revenus', source: 'user' },
    { id: 3, pattern: 'CARREFOUR', category: 'Alimentation > Épicerie', source: 'pack:fr-base' },
    { id: 4, pattern: 'BIOCOOP BORDEAUX', category: 'Alimentation > Épicerie', source: 'user' }
  ]

  it('ne retient que les règles utilisateur publiables', () => {
    const { candidates, rejected } = partitionForSharing(rules, KNOWN, new Set())
    expect(candidates.map((c) => c.pattern)).toEqual(['CULTURA', 'BIOCOOP BORDEAUX'])
    expect(rejected.map((r) => r.pattern)).toEqual(['VIR PAPA'])
  })

  it('ignore les règles déjà proposées', () => {
    const { candidates } = partitionForSharing(rules, KNOWN, new Set(['CULTURA']))
    expect(candidates.map((c) => c.pattern)).toEqual(['BIOCOOP BORDEAUX'])
  })

  it('n’expose jamais les règles issues d’un pack', () => {
    const { candidates, rejected } = partitionForSharing(rules, KNOWN, new Set())
    const all = [...candidates, ...rejected].map((r) => r.pattern)
    expect(all).not.toContain('CARREFOUR')
  })
})
