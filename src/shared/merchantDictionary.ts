/**
 * Dictionnaire d'enseignes françaises embarqué.
 *
 * Il couvre le premier import, quand la mémoire marchand est encore vide : sans
 * lui, un nouvel utilisateur doit tout valider à la main avant que quoi que ce
 * soit s'automatise.
 *
 * Statique, curé et versionné ici — rien n'est téléchargé, rien n'est partagé.
 * C'est ce qui le distingue des packs de règles communautaires retirés en
 * 1.33.0 : ceux-ci reposaient sur une heuristique « nom de personne vs
 * enseigne » sans solution fiable, problème qui ne se pose pas pour une liste
 * écrite à la main.
 *
 * Il ne prime jamais sur les décisions de l'utilisateur : la cascade
 * (voir autoCategorize) le consulte après les règles et après la mémoire.
 */

export interface MerchantDictionaryEntry {
  /** Motif cherché dans la clé marchand : majuscules, sans accent (voir merchant.ts). */
  match: string
  /** Catégorie visée, alignée sur l'arborescence par défaut (DEFAULT_CATEGORY_TREE). */
  category: string
  /**
   * Restreint l'entrée au sens de l'opération. Utile quand le même nom apparaît
   * des deux côtés : une mutuelle est une dépense au débit et un remboursement
   * au crédit.
   */
  direction?: 'debit' | 'credit'
}

const ALIMENTATION = 'Alimentation > Épicerie'
const BOULANGERIE = 'Alimentation > Boulangerie / Traiteur'
const RESTAURANT = 'Restaurants'
const FASTFOOD = 'Restaurants > Fast-food'
const CAFE = 'Restaurants > Cafés'
const LIVRAISON = 'Restaurants > Livraison repas'
const CARBURANT = 'Transport > Carburant'
const TRANSPORTS = 'Transport > Transports en commun'
const VTC = 'Transport > Taxi / VTC'
const STATIONNEMENT = 'Transport > Stationnement'
const ENERGIE = 'Logement > Électricité / Gaz'
const TELECOM = 'Logement > Internet / Téléphone'
const LOYER = 'Logement > Loyer'
const ENTRETIEN = 'Logement > Entretien'
const VETEMENTS = 'Shopping > Vêtements'
const ELECTRONIQUE = 'Shopping > Électronique'
const MAISON = 'Shopping > Maison / Déco'
const SHOPPING = 'Shopping'
const MEDECIN = 'Santé > Médecin / Dentiste'
const PHARMACIE = 'Santé > Pharmacie'
const MUTUELLE = 'Santé > Mutuelle'
const CINEMA = 'Loisirs > Cinéma / Spectacles'
const SPORT = 'Loisirs > Sport'
const JEUX = 'Loisirs > Jeux / Hobbies'
const STREAMING = 'Abonnements > Streaming'
const PRESSE = 'Abonnements > Presse / Livres'
const LOGICIELS = 'Abonnements > Logiciels'
const VOYAGE_TRANSPORT = 'Voyages > Transports voyage'
const HEBERGEMENT = 'Voyages > Hébergement'
const TOURISME = 'Voyages > Activités touristiques'
const INVESTISSEMENT = 'Épargne > Investissements'
const EPARGNE = 'Épargne > Virement épargne'
const SALAIRE = 'Salaire'
const AIDES = 'Revenus > Aides / CAF'
const REMBOURSEMENTS = 'Revenus > Remboursements'
const FRAIS_BANCAIRES = 'Frais bancaires'

/**
 * Les motifs les plus longs sont évalués en premier (voir compile ci-dessous),
 * ce qui laisse cohabiter une enseigne et sa déclinaison : « UBER EATS » est
 * de la livraison de repas avant qu'« UBER » soit du VTC, « ORANGE BLEUE » une
 * salle de sport avant qu'« ORANGE » soit un opérateur.
 */
export const MERCHANT_DICTIONARY: MerchantDictionaryEntry[] = [
  // --- Alimentation ---
  { match: 'CARREFOUR', category: ALIMENTATION },
  { match: 'LECLERC', category: ALIMENTATION },
  { match: 'INTERMARCHE', category: ALIMENTATION },
  { match: 'SUPER U', category: ALIMENTATION },
  { match: 'HYPER U', category: ALIMENTATION },
  { match: 'AUCHAN', category: ALIMENTATION },
  { match: 'LIDL', category: ALIMENTATION },
  { match: 'ALDI', category: ALIMENTATION },
  { match: 'CASINO', category: ALIMENTATION },
  { match: 'MONOPRIX', category: ALIMENTATION },
  { match: 'FRANPRIX', category: ALIMENTATION },
  { match: 'PICARD', category: ALIMENTATION },
  { match: 'GRAND FRAIS', category: ALIMENTATION },
  { match: 'BIOCOOP', category: ALIMENTATION },
  { match: 'NATURALIA', category: ALIMENTATION },
  { match: 'LA VIE CLAIRE', category: ALIMENTATION },
  { match: 'NETTO', category: ALIMENTATION },
  { match: 'CORA', category: ALIMENTATION },
  { match: 'COLRUYT', category: ALIMENTATION },
  { match: 'PROXI', category: ALIMENTATION },
  { match: 'VIVAL', category: ALIMENTATION },
  { match: 'BOUCHERIE', category: ALIMENTATION },
  { match: 'FROMAGERIE', category: ALIMENTATION },
  { match: 'PRIMEUR', category: ALIMENTATION },
  { match: 'POISSONNERIE', category: ALIMENTATION },
  { match: 'BOULANGERIE', category: BOULANGERIE },
  { match: 'PATISSERIE', category: BOULANGERIE },
  { match: 'MARIE BLACHERE', category: BOULANGERIE },
  { match: 'BRIOCHE DOREE', category: BOULANGERIE },
  { match: 'FEUILLETTE', category: BOULANGERIE },
  { match: 'TRAITEUR', category: BOULANGERIE },

  // --- Restaurants ---
  { match: 'UBER EATS', category: LIVRAISON },
  { match: 'DELIVEROO', category: LIVRAISON },
  { match: 'JUST EAT', category: LIVRAISON },
  { match: 'FRICHTI', category: LIVRAISON },
  { match: 'MCDONALD', category: FASTFOOD },
  { match: 'MCDO', category: FASTFOOD },
  { match: 'BURGER KING', category: FASTFOOD },
  { match: 'KFC', category: FASTFOOD },
  { match: 'SUBWAY', category: FASTFOOD },
  { match: 'DOMINO', category: FASTFOOD },
  { match: 'PIZZA', category: FASTFOOD },
  { match: 'FIVE GUYS', category: FASTFOOD },
  { match: 'TACOS', category: FASTFOOD },
  { match: 'STARBUCKS', category: CAFE },
  { match: 'COLUMBUS CAFE', category: CAFE },
  { match: 'BRASSERIE', category: CAFE },
  { match: 'RESTAURANT', category: RESTAURANT },
  { match: 'BISTRO', category: RESTAURANT },
  { match: 'SUSHI', category: RESTAURANT },
  { match: 'FLUNCH', category: RESTAURANT },
  { match: 'BUFFALO GRILL', category: RESTAURANT },
  { match: 'COURTEPAILLE', category: RESTAURANT },
  { match: 'HIPPOPOTAMUS', category: RESTAURANT },
  { match: 'LEON DE BRUXELLES', category: RESTAURANT },

  // --- Transport ---
  { match: 'TOTALENERGIES', category: CARBURANT },
  { match: 'TOTAL ACCESS', category: CARBURANT },
  { match: 'ESSO', category: CARBURANT },
  { match: 'SHELL', category: CARBURANT },
  { match: 'AVIA', category: CARBURANT },
  { match: 'DYNEFF', category: CARBURANT },
  { match: 'STATION SERVICE', category: CARBURANT },
  { match: 'SNCF', category: TRANSPORTS },
  { match: 'OUIGO', category: TRANSPORTS },
  { match: 'TRAINLINE', category: TRANSPORTS },
  { match: 'RATP', category: TRANSPORTS },
  { match: 'NAVIGO', category: TRANSPORTS },
  { match: 'TISSEO', category: TRANSPORTS },
  { match: 'ILEVIA', category: TRANSPORTS },
  { match: 'KEOLIS', category: TRANSPORTS },
  { match: 'TRANSDEV', category: TRANSPORTS },
  { match: 'UBER', category: VTC },
  { match: 'BOLT', category: VTC },
  { match: 'FREENOW', category: VTC },
  { match: 'HEETCH', category: VTC },
  { match: 'TAXI', category: VTC },
  { match: 'INDIGO PARK', category: STATIONNEMENT },
  { match: 'EFFIA', category: STATIONNEMENT },
  { match: 'ONEPARK', category: STATIONNEMENT },
  { match: 'ZENPARK', category: STATIONNEMENT },
  { match: 'PAYBYPHONE', category: STATIONNEMENT },
  { match: 'PARKING', category: STATIONNEMENT },
  { match: 'VINCI AUTOROUTES', category: 'Transport' },
  { match: 'SANEF', category: 'Transport' },
  { match: 'APRR', category: 'Transport' },
  { match: 'COFIROUTE', category: 'Transport' },
  { match: 'ULYS', category: 'Transport' },
  { match: 'NORAUTO', category: 'Transport' },
  { match: 'FEU VERT', category: 'Transport' },
  { match: 'MIDAS', category: 'Transport' },
  { match: 'SPEEDY', category: 'Transport' },
  { match: 'CONTROLE TECHNIQUE', category: 'Transport' },

  // --- Logement ---
  { match: 'EDF', category: ENERGIE },
  { match: 'ENGIE', category: ENERGIE },
  { match: 'VATTENFALL', category: ENERGIE },
  { match: 'EKWATEUR', category: ENERGIE },
  { match: 'MINT ENERGIE', category: ENERGIE },
  { match: 'OHM ENERGIE', category: ENERGIE },
  { match: 'ENEDIS', category: ENERGIE },
  { match: 'GRDF', category: ENERGIE },
  { match: 'VEOLIA', category: ENERGIE },
  { match: 'SUEZ', category: ENERGIE },
  { match: 'SAUR', category: ENERGIE },
  { match: 'ORANGE BLEUE', category: SPORT },
  { match: 'FREE MOBILE', category: TELECOM },
  { match: 'FREE', category: TELECOM },
  { match: 'ORANGE', category: TELECOM },
  { match: 'SFR', category: TELECOM },
  { match: 'BOUYGUES', category: TELECOM },
  { match: 'SOSH', category: TELECOM },
  { match: 'PRIXTEL', category: TELECOM },
  { match: 'NRJ MOBILE', category: TELECOM },
  { match: 'LEBARA', category: TELECOM },
  { match: 'LOYER', category: LOYER },
  { match: 'FONCIA', category: LOYER },
  { match: 'NEXITY', category: LOYER },
  { match: 'CITYA', category: LOYER },
  { match: 'ORPI', category: LOYER },
  { match: 'SERGIC', category: LOYER },
  { match: 'SQUARE HABITAT', category: LOYER },
  { match: 'LEROY MERLIN', category: ENTRETIEN },
  { match: 'CASTORAMA', category: ENTRETIEN },
  { match: 'BRICO DEPOT', category: ENTRETIEN },
  { match: 'BRICORAMA', category: ENTRETIEN },
  { match: 'MR BRICOLAGE', category: ENTRETIEN },
  { match: 'WELDOM', category: ENTRETIEN },
  { match: 'POINT P', category: ENTRETIEN },
  { match: 'JARDILAND', category: ENTRETIEN },
  { match: 'TRUFFAUT', category: ENTRETIEN },
  { match: 'BOTANIC', category: ENTRETIEN },

  // --- Shopping ---
  { match: 'AMAZON', category: SHOPPING },
  { match: 'CDISCOUNT', category: SHOPPING },
  { match: 'ZARA', category: VETEMENTS },
  { match: 'KIABI', category: VETEMENTS },
  { match: 'PRIMARK', category: VETEMENTS },
  { match: 'UNIQLO', category: VETEMENTS },
  { match: 'CELIO', category: VETEMENTS },
  { match: 'JULES', category: VETEMENTS },
  { match: 'PIMKIE', category: VETEMENTS },
  { match: 'JENNYFER', category: VETEMENTS },
  { match: 'BERSHKA', category: VETEMENTS },
  { match: 'STRADIVARIUS', category: VETEMENTS },
  { match: 'MANGO', category: VETEMENTS },
  { match: 'ZALANDO', category: VETEMENTS },
  { match: 'VINTED', category: VETEMENTS },
  { match: 'SHEIN', category: VETEMENTS },
  { match: 'ASOS', category: VETEMENTS },
  { match: 'GEMO', category: VETEMENTS },
  { match: 'LA HALLE', category: VETEMENTS },
  { match: 'CHAUSSEA', category: VETEMENTS },
  { match: 'ERAM', category: VETEMENTS },
  { match: 'COURIR', category: VETEMENTS },
  { match: 'FOOT LOCKER', category: VETEMENTS },
  { match: 'JD SPORTS', category: VETEMENTS },
  { match: 'FNAC', category: ELECTRONIQUE },
  { match: 'BOULANGER', category: ELECTRONIQUE },
  { match: 'DARTY', category: ELECTRONIQUE },
  { match: 'LDLC', category: ELECTRONIQUE },
  { match: 'MATERIEL NET', category: ELECTRONIQUE },
  { match: 'RUE DU COMMERCE', category: ELECTRONIQUE },
  { match: 'BACKMARKET', category: ELECTRONIQUE },
  { match: 'BACK MARKET', category: ELECTRONIQUE },
  { match: 'APPLE STORE', category: ELECTRONIQUE },
  { match: 'IKEA', category: MAISON },
  { match: 'MAISONS DU MONDE', category: MAISON },
  { match: 'CONFORAMA', category: MAISON },
  { match: 'ALINEA', category: MAISON },
  { match: 'GIFI', category: MAISON },
  { match: 'CENTRAKOR', category: MAISON },
  { match: 'ZODIO', category: MAISON },
  { match: 'HEMA', category: MAISON },

  // --- Santé ---
  { match: 'PHARMACIE', category: PHARMACIE },
  { match: 'PARAPHARMACIE', category: PHARMACIE },
  { match: 'DOCTOLIB', category: MEDECIN },
  { match: 'LABORATOIRE', category: MEDECIN },
  { match: 'CLINIQUE', category: MEDECIN },
  { match: 'HOPITAL', category: MEDECIN },
  { match: 'CENTRE HOSPITALIER', category: MEDECIN },
  { match: 'DENTAIRE', category: MEDECIN },
  { match: 'DENTISTE', category: MEDECIN },
  { match: 'RADIOLOGIE', category: MEDECIN },
  { match: 'OPHTALMO', category: MEDECIN },
  { match: 'KINE', category: MEDECIN },
  { match: 'OSTEOPATHE', category: MEDECIN },
  { match: 'OPTIC', category: MEDECIN },
  { match: 'AUDIKA', category: MEDECIN },
  { match: 'MUTUELLE', category: MUTUELLE, direction: 'debit' },
  { match: 'HARMONIE MUTUELLE', category: MUTUELLE, direction: 'debit' },
  { match: 'MGEN', category: MUTUELLE, direction: 'debit' },
  { match: 'MALAKOFF', category: MUTUELLE, direction: 'debit' },
  { match: 'ALAN', category: MUTUELLE, direction: 'debit' },

  // --- Loisirs ---
  { match: 'UGC', category: CINEMA },
  { match: 'PATHE', category: CINEMA },
  { match: 'GAUMONT', category: CINEMA },
  { match: 'KINEPOLIS', category: CINEMA },
  { match: 'MEGARAMA', category: CINEMA },
  { match: 'CINEMA', category: CINEMA },
  { match: 'TICKETMASTER', category: CINEMA },
  { match: 'BILLETREDUC', category: CINEMA },
  { match: 'DIGITICK', category: CINEMA },
  { match: 'BASIC FIT', category: SPORT },
  { match: 'FITNESS PARK', category: SPORT },
  { match: 'KEEP COOL', category: SPORT },
  { match: 'NEONESS', category: SPORT },
  { match: 'DECATHLON', category: SPORT },
  { match: 'INTERSPORT', category: SPORT },
  { match: 'GO SPORT', category: SPORT },
  { match: 'PISCINE', category: SPORT },
  { match: 'STEAM', category: JEUX },
  { match: 'PLAYSTATION', category: JEUX },
  { match: 'NINTENDO', category: JEUX },
  { match: 'XBOX', category: JEUX },
  { match: 'MICROMANIA', category: JEUX },
  { match: 'KING JOUET', category: JEUX },
  { match: 'JOUECLUB', category: JEUX },
  { match: 'LA GRANDE RECRE', category: JEUX },
  { match: 'CULTURA', category: JEUX },

  // --- Abonnements ---
  { match: 'NETFLIX', category: STREAMING },
  { match: 'SPOTIFY', category: STREAMING },
  { match: 'DEEZER', category: STREAMING },
  { match: 'DISNEY', category: STREAMING },
  { match: 'PRIME VIDEO', category: STREAMING },
  { match: 'CANAL', category: STREAMING },
  { match: 'MOLOTOV', category: STREAMING },
  { match: 'CRUNCHYROLL', category: STREAMING },
  { match: 'APPLE MUSIC', category: STREAMING },
  { match: 'YOUTUBE', category: STREAMING },
  { match: 'TWITCH', category: STREAMING },
  { match: 'AUDIBLE', category: PRESSE },
  { match: 'KINDLE', category: PRESSE },
  { match: 'KOBO', category: PRESSE },
  { match: 'CAFEYN', category: PRESSE },
  { match: 'MEDIAPART', category: PRESSE },
  { match: 'LE MONDE', category: PRESSE },
  { match: 'LE FIGARO', category: PRESSE },
  { match: 'TELERAMA', category: PRESSE },
  { match: 'MICROSOFT', category: LOGICIELS },
  { match: 'ADOBE', category: LOGICIELS },
  { match: 'GOOGLE', category: LOGICIELS },
  { match: 'DROPBOX', category: LOGICIELS },
  { match: 'ICLOUD', category: LOGICIELS },
  { match: 'NOTION', category: LOGICIELS },
  { match: 'FIGMA', category: LOGICIELS },
  { match: 'GITHUB', category: LOGICIELS },
  { match: 'OPENAI', category: LOGICIELS },
  { match: 'ANTHROPIC', category: LOGICIELS },
  { match: 'CANVA', category: LOGICIELS },
  { match: 'NORDVPN', category: LOGICIELS },
  { match: 'OVH', category: LOGICIELS },
  { match: 'GANDI', category: LOGICIELS },
  { match: 'IONOS', category: LOGICIELS },
  { match: 'SCALEWAY', category: LOGICIELS },

  // --- Voyages ---
  { match: 'AIRBNB', category: HEBERGEMENT },
  { match: 'BOOKING', category: HEBERGEMENT },
  { match: 'ABRITEL', category: HEBERGEMENT },
  { match: 'HOTEL', category: HEBERGEMENT },
  { match: 'IBIS', category: HEBERGEMENT },
  { match: 'NOVOTEL', category: HEBERGEMENT },
  { match: 'MERCURE', category: HEBERGEMENT },
  { match: 'CAMPANILE', category: HEBERGEMENT },
  { match: 'PREMIERE CLASSE', category: HEBERGEMENT },
  { match: 'AIR FRANCE', category: VOYAGE_TRANSPORT },
  { match: 'RYANAIR', category: VOYAGE_TRANSPORT },
  { match: 'EASYJET', category: VOYAGE_TRANSPORT },
  { match: 'TRANSAVIA', category: VOYAGE_TRANSPORT },
  { match: 'VUELING', category: VOYAGE_TRANSPORT },
  { match: 'VOLOTEA', category: VOYAGE_TRANSPORT },
  { match: 'LUFTHANSA', category: VOYAGE_TRANSPORT },
  { match: 'EUROSTAR', category: VOYAGE_TRANSPORT },
  { match: 'FLIXBUS', category: VOYAGE_TRANSPORT },
  { match: 'BLABLACAR', category: VOYAGE_TRANSPORT },
  { match: 'CENTER PARCS', category: TOURISME },
  { match: 'DISNEYLAND', category: TOURISME },
  { match: 'PARC ASTERIX', category: TOURISME },
  { match: 'PUY DU FOU', category: TOURISME },
  { match: 'GETYOURGUIDE', category: TOURISME },
  { match: 'MUSEE', category: TOURISME },

  // --- Épargne ---
  { match: 'TRADE REPUBLIC', category: INVESTISSEMENT },
  { match: 'DEGIRO', category: INVESTISSEMENT },
  { match: 'BOURSE DIRECT', category: INVESTISSEMENT },
  { match: 'ETORO', category: INVESTISSEMENT },
  { match: 'BINANCE', category: INVESTISSEMENT },
  { match: 'COINBASE', category: INVESTISSEMENT },
  { match: 'KRAKEN', category: INVESTISSEMENT },
  { match: 'YOMONI', category: INVESTISSEMENT },
  { match: 'NALO', category: INVESTISSEMENT },
  { match: 'RAMIFY', category: INVESTISSEMENT },
  { match: 'LINXEA', category: INVESTISSEMENT },
  { match: 'LIVRET A', category: EPARGNE },
  { match: 'LDDS', category: EPARGNE },

  // --- Revenus ---
  { match: 'SALAIRE', category: SALAIRE, direction: 'credit' },
  { match: 'PAIE', category: SALAIRE, direction: 'credit' },
  { match: 'CAF', category: AIDES, direction: 'credit' },
  { match: 'ALLOCATIONS FAMILIALES', category: AIDES, direction: 'credit' },
  { match: 'POLE EMPLOI', category: AIDES, direction: 'credit' },
  { match: 'FRANCE TRAVAIL', category: AIDES, direction: 'credit' },
  { match: 'CPAM', category: REMBOURSEMENTS, direction: 'credit' },
  { match: 'AMELI', category: REMBOURSEMENTS, direction: 'credit' },
  { match: 'ASSURANCE MALADIE', category: REMBOURSEMENTS, direction: 'credit' },
  { match: 'MUTUELLE', category: REMBOURSEMENTS, direction: 'credit' },

  // --- Frais bancaires ---
  { match: 'COTISATION', category: FRAIS_BANCAIRES, direction: 'debit' },
  { match: 'FRAIS BANCAIRES', category: FRAIS_BANCAIRES, direction: 'debit' },
  { match: 'FRAIS TENUE DE COMPTE', category: FRAIS_BANCAIRES, direction: 'debit' },
  { match: 'AGIOS', category: FRAIS_BANCAIRES, direction: 'debit' },
  { match: 'COMMISSION INTERVENTION', category: FRAIS_BANCAIRES, direction: 'debit' }
]

interface CompiledEntry {
  regex: RegExp
  category: string
  direction?: 'debit' | 'credit'
}

/** Les motifs longs d'abord : « UBER EATS » doit l'emporter sur « UBER ». */
const COMPILED: CompiledEntry[] = [...MERCHANT_DICTIONARY]
  .sort((a, b) => b.match.length - a.match.length)
  .map((entry) => ({
    // Bornes de mots : « BUT » ne doit pas matcher « DEBUT ».
    regex: new RegExp(`(^|\\s)${entry.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`),
    category: entry.category,
    direction: entry.direction
  }))

/**
 * Catégorie proposée par le dictionnaire pour une clé marchand, ou null si
 * aucune entrée ne correspond.
 *
 * `amount` sert à départager les entrées orientées : au débit une mutuelle est
 * une dépense de santé, au crédit c'est un remboursement.
 */
export function lookupMerchantDictionary(merchantKey: string, amount: number): string | null {
  if (!merchantKey) return null
  const direction = amount < 0 ? 'debit' : 'credit'

  for (const entry of COMPILED) {
    if (entry.direction && entry.direction !== direction) continue
    if (entry.regex.test(merchantKey)) return entry.category
  }

  return null
}
