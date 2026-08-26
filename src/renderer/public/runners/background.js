/**
 * Surveillance Powens en arrière-plan — @capacitor/background-runner.
 *
 * CE FICHIER NE TOURNE PAS DANS LE WEBVIEW. Il est évalué par un moteur JS
 * autonome (QuickJS sur Android, JavaScriptCore sur iOS) réveillé par l'OS
 * (WorkManager / BGTaskScheduler) même quand Banquier est fermé. Conséquences
 * directes sur la façon de l'écrire :
 *
 *  - Aucun import/export : le fichier est chargé tel quel, il doit être autonome.
 *    C'est la raison de la petite duplication avec src/mobile/powens.ts.
 *  - Pas de DOM, pas de plugins Capacitor. Seuls existent `fetch`, `console`,
 *    `setTimeout`, `crypto`, `TextEncoder/Decoder` et les API listées ci-dessous
 *    (`CapacitorKV`, `CapacitorNotifications`, `CapacitorDevice`).
 *  - PAS D'ACCÈS À SQLITE. Le runner ne peut donc pas importer les transactions
 *    en base : il détecte les nouveautés côté Powens, prévient par notification,
 *    et laisse `powensStartupSync` faire l'import réel à la réouverture de l'app.
 *  - `resolve()` (ou `reject()`) DOIT être appelé dans chaque gestionnaire, sinon
 *    l'OS tue le processus au bout de quelques secondes.
 *  - Chaque exécution repart d'un contexte neuf : le seul état qui survit est
 *    celui écrit dans `CapacitorKV` (SharedPreferences / UserDefaults nommés
 *    d'après le `label` du runner — voir capacitor.config.ts).
 *
 * Le pendant côté app est src/mobile/background-sync.ts, qui pousse ici les
 * identifiants via l'événement `configure` et relit l'état via `status`.
 *
 * Écrit en promesses `.then()` plutôt qu'en async/await, et en ES5 sans littéraux
 * de gabarit : c'est le style des exemples officiels du plugin, donc celui dont la
 * compatibilité est garantie sur les deux moteurs.
 */

/* global addEventListener, CapacitorKV, CapacitorNotifications, CapacitorDevice, fetch */

// --- Clés persistées ---------------------------------------------------------

var KEY_ENABLED = 'enabled'
var KEY_DOMAIN = 'domain'
var KEY_TOKEN = 'token'
var KEY_CURRENCY = 'currencySymbol'
/** Plus grand id de transaction Powens déjà vu. Sert de curseur : tout id
 *  supérieur est une nouveauté. Vide = premier passage (voir plus bas). */
var KEY_LAST_SEEN_ID = 'lastSeenId'
var KEY_LAST_CHECK_AT = 'lastCheckAt'
var KEY_LAST_ERROR = 'lastError'
/** Nombre de transactions détectées en fond et pas encore importées en base. */
var KEY_PENDING_COUNT = 'pendingCount'
/** Signature des connexions en erreur déjà notifiées, pour ne pas répéter la
 *  même alerte « banque à reconnecter » toutes les heures. */
var KEY_NOTIFIED_ERRORS = 'notifiedConnectionErrors'

// --- Notifications -----------------------------------------------------------

// Canaux créés côté app (src/mobile/notifications.ts) : Android n'affiche RIEN si
// le canal n'existe pas encore, d'où l'appel à ensureChannels() au démarrage.
var CHANNEL_SYNC = 'banquier-sync'
var CHANNEL_ALERTS = 'banquier-alerts'
var ICON = 'ic_stat_banquier'
// Ids distincts de ceux de l'app (1001-1004) : une notification de fond ne doit
// pas écraser le résultat d'une synchro faite à l'écran, et inversement.
var ID_NEW_TRANSACTIONS = 1101
var ID_CONNECTION_ERROR = 1102

// --- Réglages ----------------------------------------------------------------

/** Fenêtre interrogée à chaque réveil. Assez large pour rattraper plusieurs jours
 *  sans réseau, assez étroite pour que la réponse reste légère. */
var LOOKBACK_DAYS = 15
var PAGE_LIMIT = 300

// --- Petites aides -----------------------------------------------------------

function kvGet(key) {
  try {
    var res = CapacitorKV.get(key)
    if (!res || res.value === null || res.value === undefined) return ''
    return String(res.value)
  } catch (err) {
    return ''
  }
}

function kvSet(key, value) {
  try {
    CapacitorKV.set(key, value === null || value === undefined ? '' : String(value))
  } catch (err) {
    console.error('[bg-sync] écriture ' + key + ' impossible', err)
  }
}

/** Accepte aussi bien `true` que "true"/"1" : selon la plateforme, les valeurs
 *  passées à dispatchEvent arrivent en booléen ou en chaîne. */
function truthy(value) {
  return value === true || value === 'true' || value === '1' || value === 1
}

function notify(id, channelId, title, body) {
  try {
    CapacitorNotifications.schedule([
      {
        id: id,
        channelId: channelId,
        title: title,
        body: body,
        smallIcon: ICON,
        autoCancel: true,
        ongoing: false
      }
    ])
  } catch (err) {
    console.error('[bg-sync] notification impossible', err)
  }
}

/** `-47.2` → `-47,20 €`. Intl n'existe pas dans ce moteur : formatage à la main. */
function formatAmount(value, symbol) {
  var fixed = (Math.round(value * 100) / 100).toFixed(2).replace('.', ',')
  return fixed + ' ' + (symbol || '€')
}

function plural(count) {
  return count > 1 ? 's' : ''
}

// --- Client Powens (extrait autonome de src/mobile/powens.ts) ----------------

function baseUrl(domain) {
  var name = String(domain)
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.biapi\.pro\/?$/i, '')
  return 'https://' + name + '.biapi.pro/2.0'
}

function apiGet(domain, token, path) {
  return fetch(baseUrl(domain) + path, {
    method: 'GET',
    headers: { accept: 'application/json', authorization: 'Bearer ' + token }
  }).then(function (res) {
    if (!res.ok) throw new Error('Powens a répondu ' + res.status + ' sur ' + path)
    return res.json()
  })
}

function minDateParam() {
  var d = new Date(Date.now() - LOOKBACK_DAYS * 86400000)
  return d.toISOString().slice(0, 10)
}

// --- Détection des nouvelles transactions ------------------------------------

/**
 * Les transactions `coming` sont des écritures annoncées mais non passées : l'import
 * de l'app les ignore, les compter ici annoncerait des mouvements qui n'arriveront
 * jamais en base.
 */
function bookedTransactions(payload) {
  var list = (payload && payload.transactions) || []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!list[i] || list[i].coming) continue
    if (typeof list[i].id !== 'number') continue
    out.push(list[i])
  }
  return out
}

function maxId(transactions) {
  var max = 0
  for (var i = 0; i < transactions.length; i++) {
    if (transactions[i].id > max) max = transactions[i].id
  }
  return max
}

function sumValues(transactions) {
  var total = 0
  for (var i = 0; i < transactions.length; i++) {
    if (typeof transactions[i].value === 'number') total += transactions[i].value
  }
  return total
}

function checkTransactions(state) {
  var path = '/users/me/transactions?limit=' + PAGE_LIMIT + '&min_date=' + minDateParam()

  return apiGet(state.domain, state.token, path).then(function (payload) {
    var booked = bookedTransactions(payload)
    var highest = maxId(booked)

    // Premier passage : on pose le curseur sans rien annoncer. Sans cette garde,
    // activer la surveillance déclencherait une notification « 128 nouvelles
    // transactions » portant sur des mouvements déjà en base depuis longtemps.
    if (!state.lastSeenId) {
      if (highest > 0) kvSet(KEY_LAST_SEEN_ID, highest)
      return 0
    }

    var fresh = []
    for (var i = 0; i < booked.length; i++) {
      if (booked[i].id > state.lastSeenId) fresh.push(booked[i])
    }

    if (highest > state.lastSeenId) kvSet(KEY_LAST_SEEN_ID, highest)
    if (fresh.length === 0) return 0

    // Le compteur s'accumule d'un réveil à l'autre : l'app peut rester fermée
    // plusieurs jours, et c'est le total non importé qui l'intéresse.
    var pending = (parseInt(kvGet(KEY_PENDING_COUNT), 10) || 0) + fresh.length
    kvSet(KEY_PENDING_COUNT, pending)

    notify(
      ID_NEW_TRANSACTIONS,
      CHANNEL_SYNC,
      fresh.length + ' nouvelle' + plural(fresh.length) + ' transaction' + plural(fresh.length),
      'Total ' +
        formatAmount(sumValues(fresh), state.currencySymbol) +
        ' · ouvrez Banquier pour les importer.'
    )

    return fresh.length
  })
}

// --- Détection des banques à reconnecter -------------------------------------

var CONNECTION_STATE_LABELS = {
  wrongpass: 'identifiants refusés par la banque — reconnectez-la',
  additionalInformationNeeded: 'la banque demande une information supplémentaire',
  actionNeeded: 'une action est requise sur le site de votre banque',
  SCARequired: 'authentification forte à revalider',
  webauthRequired: 'reconnexion à la banque nécessaire',
  decoupled: "validation en attente dans l'application de votre banque",
  passwordExpired: 'mot de passe bancaire expiré',
  websiteUnavailable: 'site de la banque temporairement indisponible',
  rateLimiting: 'trop de tentatives, réessayez dans quelques minutes',
  bug: 'erreur technique côté Powens'
}

function checkConnections(state) {
  return apiGet(state.domain, state.token, '/users/me/connections?expand=connector').then(
    function (payload) {
      var connections = (payload && payload.connections) || []
      var labels = []
      var signature = []

      for (var i = 0; i < connections.length; i++) {
        var c = connections[i]
        // `validating` = synchro en cours côté Powens, pas une erreur.
        if (!c || c.active === false || !c.state || c.state === 'validating') continue
        var bank = c.connector && c.connector.name ? c.connector.name + ' : ' : ''
        var label = CONNECTION_STATE_LABELS[c.state] || c.error_message || c.state
        labels.push(bank + label)
        signature.push(c.id + ':' + c.state)
      }

      var current = signature.join('|')
      // Réveil toutes les heures : sans ce comparatif, une banque en erreur pendant
      // trois jours enverrait 72 fois la même alerte.
      if (current === kvGet(KEY_NOTIFIED_ERRORS)) return
      kvSet(KEY_NOTIFIED_ERRORS, current)
      if (labels.length === 0) return

      notify(ID_CONNECTION_ERROR, CHANNEL_ALERTS, 'Banque à reconnecter', labels.join(' · ').slice(0, 200))
    }
  )
}

// --- État --------------------------------------------------------------------

function readState() {
  return {
    enabled: kvGet(KEY_ENABLED) === '1',
    domain: kvGet(KEY_DOMAIN),
    token: kvGet(KEY_TOKEN),
    currencySymbol: kvGet(KEY_CURRENCY) || '€',
    lastSeenId: parseInt(kvGet(KEY_LAST_SEEN_ID), 10) || 0
  }
}

/** Vue publique de l'état, renvoyée à l'app. Sans le token : il n'a aucune raison
 *  de refaire le trajet inverse jusqu'à l'interface. */
function publicStatus() {
  return {
    enabled: kvGet(KEY_ENABLED) === '1',
    configured: kvGet(KEY_TOKEN) !== '' && kvGet(KEY_DOMAIN) !== '',
    lastCheckAt: kvGet(KEY_LAST_CHECK_AT),
    lastError: kvGet(KEY_LAST_ERROR),
    pendingCount: parseInt(kvGet(KEY_PENDING_COUNT), 10) || 0,
    lastSeenId: parseInt(kvGet(KEY_LAST_SEEN_ID), 10) || 0
  }
}

function networkAvailable() {
  try {
    var status = CapacitorDevice.getNetworkStatus()
    // API absente ou muette : on tente l'appel plutôt que de sauter le réveil.
    if (!status || status.connected === undefined) return true
    return status.connected === true
  } catch (err) {
    return true
  }
}

// --- Événements --------------------------------------------------------------

/**
 * Réveil périodique déclenché par l'OS (nom déclaré dans capacitor.config.ts).
 * Ne rejette jamais : un `reject()` marque la tâche WorkManager en échec sans
 * rien apporter, alors que l'erreur est presque toujours transitoire (réseau
 * coupé, Powens indisponible). Elle est conservée pour l'écran Paramètres.
 */
addEventListener('checkTransactions', function (resolve, reject, args) {
  var state = readState()
  kvSet(KEY_LAST_CHECK_AT, new Date().toISOString())

  if (!state.enabled || !state.token || !state.domain) {
    resolve({ skipped: true, newCount: 0 })
    return
  }

  if (!networkAvailable()) {
    resolve({ skipped: true, newCount: 0 })
    return
  }

  checkTransactions(state)
    .then(function (newCount) {
      // Les connexions ne sont qu'un bonus : leur échec ne doit pas effacer un
      // résultat de transactions déjà obtenu.
      return checkConnections(state).then(
        function () {
          return newCount
        },
        function (err) {
          console.warn('[bg-sync] lecture des connexions impossible', err)
          return newCount
        }
      )
    })
    .then(function (newCount) {
      kvSet(KEY_LAST_ERROR, '')
      resolve({ skipped: false, newCount: newCount })
    })
    .catch(function (err) {
      var message = (err && err.message) || String(err)
      kvSet(KEY_LAST_ERROR, message.slice(0, 200))
      console.error('[bg-sync] échec de la vérification', message)
      resolve({ skipped: false, newCount: 0, error: message })
    })
})

/**
 * Écriture de la configuration depuis l'app (identifiants Powens, interrupteur,
 * remise à zéro du compteur après import). Seules les clés fournies sont touchées :
 * l'app n'a pas à connaître l'état complet pour en modifier une bribe.
 */
addEventListener('configure', function (resolve, reject, args) {
  try {
    var a = args || {}
    if (a.enabled !== undefined) kvSet(KEY_ENABLED, truthy(a.enabled) ? '1' : '0')
    if (a.domain !== undefined) kvSet(KEY_DOMAIN, a.domain)
    if (a.token !== undefined) kvSet(KEY_TOKEN, a.token)
    if (a.currencySymbol !== undefined) kvSet(KEY_CURRENCY, a.currencySymbol)
    if (a.pendingCount !== undefined) kvSet(KEY_PENDING_COUNT, parseInt(a.pendingCount, 10) || 0)

    // Déconnexion Powens ou désactivation : le curseur et les alertes déjà émises
    // n'ont plus de sens. Les garder ferait passer, à la reconnexion suivante,
    // tout l'historique rapatrié pour « nouveau ».
    if (truthy(a.reset)) {
      kvSet(KEY_LAST_SEEN_ID, '')
      kvSet(KEY_PENDING_COUNT, 0)
      kvSet(KEY_NOTIFIED_ERRORS, '')
      kvSet(KEY_LAST_ERROR, '')
    }

    resolve(publicStatus())
  } catch (err) {
    reject(err)
  }
})

addEventListener('status', function (resolve, reject, args) {
  try {
    resolve(publicStatus())
  } catch (err) {
    reject(err)
  }
})
