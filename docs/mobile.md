# Banquier sur mobile (Android / iOS)

Banquier existe désormais en app mobile native (via [Capacitor](https://capacitorjs.com)), en plus de la version desktop Electron. C'est un chantier en plusieurs phases — voici où ça en est. Le portage Android est le plus avancé (Phases 1-3 disponibles, voir plus bas) ; le portage iOS est pour l'instant au stade du scaffolding — voir [iOS](#ios) en fin de document.

## Comment ça marche

L'interface (React/Vite) est la même que sur desktop, mais tourne dans une WebView native au lieu d'Electron. Côté données, l'app Android ne parle plus à un process Electron via IPC : elle embarque sa propre base SQLite locale sur le téléphone (`@capacitor-community/sqlite`) et implémente directement en JS/TS ce que le process principal Electron fait pour desktop. Le code correspondant vit dans `src/mobile/` :

- `src/mobile/db.ts` — connexion SQLite + schéma
- `src/mobile/api/` — port des fonctions de `src/main/database.ts` utiles aux Phases 1-3
- `src/mobile/parsers/csv.ts` — parsing CSV (port de `src/main/parsers/csv.ts`)
- `src/mobile/llm.ts` — chat financier + catégorisation IA (port de `src/main/llm.ts`, LangChain/OpenRouter)
- `src/mobile/powens.ts`, `src/mobile/powens-webview.ts`, `src/mobile/powens-sync.ts` — synchronisation bancaire Powens (port de `src/main/powens.ts`)
- `src/mobile/notifications.ts` — notifications système Android (`@capacitor/local-notifications`)
- `src/mobile/window-api.ts` — remplace le `window.api` injecté par le preload Electron
- `src/mobile/entry.ts` — installé automatiquement par `src/renderer/src/main.tsx` quand l'app ne tourne pas sous Electron

Rien dans `src/main/`, `src/preload/` ou les pages de `src/renderer/` n'a été modifié pour ce port (à l'exception d'une ligne d'amorçage conditionnelle dans `main.tsx`) — la build desktop (`npm run dev`, `npm run build:win`) n'est pas affectée. Seule exception délibérée : `src/mobile/llm.ts` réutilise directement `src/main/memory.ts` (recherche BM25 pour le RAG des mémoires IA), un module pur sans dépendance Electron/Node, importé tel quel plutôt que dupliqué.

Les appels réseau (OpenRouter) passent par le plugin `CapacitorHttp` (activé dans `capacitor.config.ts`), qui route `fetch()` nativement côté Android plutôt que par la WebView — ça évite les blocages CORS que rencontrerait un appel direct à une API tierce depuis une WebView.

## Phase 1 — cœur hors-ligne (disponible)

Le cœur 100 % hors-ligne de Banquier, sur ta base SQLite locale au téléphone :

- Comptes, transactions (liste/filtre/édition/suppression)
- Import CSV (avec détection de délimiteur/en-tête comme sur desktop)
- Catégories + règles automatiques de catégorisation
- Budgets mensuels
- Tableau de bord (résumé, tendances, top catégories/marchands, non catégorisé)
- Paramètres de base (devise, langue, thème, onboarding)

## Phase 2 — IA (disponible)

- Catégorisation automatique par IA (par lots, avec les règles utilisateur prioritaires)
- Chat financier avec les mêmes 9 outils que sur desktop (transactions, stats par catégorie/mois, comptes, top marchands, plus grosses transactions, comparaison de périodes, non catégorisé, solde net, mémorisation)
- Mémoire IA (RAG BM25) : les informations durables mentionnées en conversation sont retenues et réinjectées dans les échanges suivants
- Nécessite une clé API OpenRouter, à renseigner dans Paramètres → Clé API (identique au flux desktop)

## Phase 3 — Synchronisation bancaire Powens (disponible, non testée en conditions réelles)

- Connexion bancaire via le webview Powens, ouvert dans un Custom Tab (`@capacitor/browser`) au lieu d'une fenêtre Electron
- La redirection OAuth est captée via un deep link `banquier://powens-callback` (`@capacitor/app` + intent-filter dans `AndroidManifest.xml`), au lieu de l'interception de navigation Electron
- Synchronisation initiale et incrémentale, mapping des comptes, dédoublonnage, ré-application des règles — identique au flux desktop
- Mêmes identifiants Powens sandbox que le desktop (même tenant `banquier-sandbox`)

### ⚠️ Prérequis : déclarer le redirect_uri dans la console Powens

Powens valide le `redirect_uri` contre une liste blanche définie dans la **console d'administration**. Sans ça, le webview refuse la connexion avec :

> `invalid 'redirect_uri', the parameter must match the constraints defined in the administration console`

Il faut donc ajouter, à côté du `http://localhost:8645` déjà utilisé par le desktop :

```
banquier://powens-callback
```

Cette valeur doit rester synchronisée avec `MOBILE_REDIRECT_URI` (`src/mobile/powens.ts`) et l'`intent-filter` de `android/app/src/main/AndroidManifest.xml`.

### Robustesse du parcours de connexion

Le parcours bancaire sort de l'app (Custom Tab, puis souvent l'app de la banque en App2App), ce qui expose trois façons de perdre une connexion pourtant réussie. Chacune est traitée explicitement :

| Situation | Traitement |
|---|---|
| `browserFinished` (fermeture du Custom Tab) arrive avant `appUrlOpen` (deep link) | Délai de grâce de 2 s avant de conclure quoi que ce soit (`DEEPLINK_GRACE_MS`) |
| Le deep link n'arrive jamais (retour au navigateur au lieu de l'app) | Le webview renvoie `dismissed` au lieu de lever « Connexion annulée » ; `powensConnect` attend qu'une nouvelle connexion apparaisse côté Powens (jusqu'à ~1 min), **sans jamais transformer une expiration de cette attente en erreur** — voir ci-dessous |
| Android détruit l'activité pendant le Custom Tab (mémoire, « Ne pas conserver les activités ») | Le drapeau `powensConnectPending` est posé avant l'ouverture ; au redémarrage, `powensStartupSync` le voit et relance un import large au lieu d'un simple incrément |

**Pourquoi ne plus jamais lever « Connexion annulée » depuis `powensConnect`.** Une première version attendait qu'une nouvelle connexion apparaisse pendant une fenêtre bornée (d'abord un essai unique, puis 8 essais sur ~20 s), et levait une erreur si rien n'apparaissait dans ce délai. En pratique, Powens peut mettre nettement plus longtemps à enregistrer la connexion côté serveur après la fin de l'authentification bancaire (SCA, App2App…) — le symptôme observé était un compte qui n'apparaissait qu'après avoir **quitté et rouvert l'app**, ce qui relance `powensStartupSync`. Ce dernier fonctionnait précisément parce qu'il n'a jamais eu ce genre de délai couperet : il attend (voir `waitForConnections` ci-dessous) et renvoie un avertissement, jamais une erreur bloquante, si rien n'arrive. `powensConnect` reproduit maintenant ce comportement : la vérification post-`dismissed` attend jusqu'à ~1 min qu'une connexion apparaisse, mais **quoi qu'il arrive** laisse ensuite `importPowens()` trancher — lui seul décide, via `waitForConnections`, s'il y a vraiment un souci à signaler.

### Attente de la banque, et pourquoi elle était trop longue

Powens interroge la banque de façon asynchrone : les transactions n'existent pas côté API tant que la connexion n'a pas de `last_update`. La première version attendait à l'aveugle (10 × 3 s pour les comptes, puis 12 × 5 s pour les transactions), avec deux conséquences : l'utilisateur attendait le délai complet même quand la banque avait déjà répondu, et une connexion en erreur (identifiants refusés, authentification forte à revalider…) renvoyait silencieusement « 0 transaction ».

`powens-sync.ts` lit désormais `/users/me/connections` :

- il repart **dès que** la banque a terminé, au lieu d'attendre un délai fixe ;
- il traduit les états d'erreur Powens (`wrongpass`, `SCARequired`, `actionNeeded`, `websiteUnavailable`…) en messages actionnables, remontés dans `PowensSyncResult.warning` et affichés dans l'app ;
- il publie son étape courante, consommée par `window.api.onPowensProgress`.

### Synchronisation en tâche de fond

`src/renderer/src/utils/powensJob.ts` pilote toutes les synchronisations depuis un état unique vivant **hors de React**. L'UI ne fait plus qu'afficher cet état, ce qui règle plusieurs problèmes d'un coup : l'écran reste utilisable pendant la synchro, l'avancement est visible partout (onboarding, paramètres, toast global), une synchro survit au changement de page ou à la fermeture de l'onboarding, et deux synchronisations concurrentes ne peuvent plus démarrer.

Sur desktop, `onPowensProgress` est absent de `window.api` : le job fonctionne à l'identique, avec un simple démarré/terminé.

### État de la vérification

Le flux n'a pas encore été validé de bout en bout sur un appareil : cet environnement de développement n'a ni SDK Android ni accès à un vrai parcours bancaire.

## Phase 6 — Récurrences, Comparaison, Simulateur (disponible, non testée en conditions réelles)

- **Récurrences** (`Recurring.tsx`) — détection des abonnements/prélèvements réguliers, portée depuis `src/main/database.ts` (`getRecurringExpenses` et ses fonctions pures `classifyFrequency`/`mostCommonCategory`/`median`) vers `src/mobile/api/dashboard.ts`, à l'identique de la logique desktop : regroupement par marchand normalisé (réutilise le `normalizeMerchant` déjà porté pour `getTopMerchants`), classification de fréquence par intervalle médian, filtrage par coefficient de variation pour écarter les paiements trop irréguliers.
- **Comparaison de périodes** (`Comparaison.tsx`) — `comparePeriods` était déjà entièrement porté et utilisé par les 9 outils du chat financier (Phase 2) ; il ne manquait que le branchement au niveau du `window.api` exposé aux pages, maintenant fait.
- **Simulateur d'épargne** (`Simulateur.tsx`) — n'a nécessité aucun portage : c'est un calcul d'intérêts composés/objectif d'épargne entièrement côté client, sans le moindre appel à `window.api`. La page, partagée entre desktop et mobile, fonctionnait donc déjà telle quelle.

Comme pour la Phase 3, ce portage n'a pas été validé de bout en bout sur un appareil ou un émulateur réel — cet environnement de développement n'a ni SDK Android ni device.

## Notifications système

Les alertes de Banquier étaient jusqu'ici de simples toasts HTML : invisibles dès que l'app passe en arrière-plan — c'est-à-dire précisément pendant une synchronisation bancaire, qui peut durer plusieurs minutes.

`src/mobile/notifications.ts` ajoute de vraies notifications Android (barre de statut + bannière) via `@capacitor/local-notifications`, sur deux canaux en importance haute :

| Notification | Déclencheur |
|---|---|
| Synchronisation terminée | Fin d'import avec au moins une nouvelle transaction |
| Banque à reconnecter | Connexion Powens en erreur (`warning` d'un import) |
| Synchronisation échouée | Exception pendant une synchro |
| Budget dépassé | Au démarrage, au plus une fois par jour |
| Rappel quotidien | Heure choisie dans Paramètres → Notifications ; programmé côté OS, se déclenche app fermée |

La permission `POST_NOTIFICATIONS` (obligatoire depuis Android 13) est demandée à l'étape « Notifications » de l'onboarding, et réactivable dans Paramètres → Notifications. L'icône de la barre de statut est un drawable monochrome dédié (`res/drawable/ic_stat_banquier.xml`) : Android n'affiche que la silhouette du small icon, réutiliser `ic_launcher` produirait un carré blanc.

**Pourquoi des notifications locales et pas du push FCM.** Le push FCM suppose un serveur qui pousse les messages. Banquier n'en a pas — toutes les données vivent dans le SQLite du téléphone, et chacun des événements ci-dessus est produit par l'app elle-même. Les notifications locales couvrent donc l'intégralité des cas, avec le même rendu système qu'un push (bannière, son, barre de statut, persistance app fermée pour le rappel programmé). Un vrai push FCM ne deviendra pertinent que le jour où un backend Banquier recevra les webhooks Powens.

## Pas encore disponible sur mobile (roadmap)

- **Phase 4** — Patrimoine, actifs, plans DCA, cours (crypto/bourse)
- **Phase 5** — Import PDF
- **Phase 7** — Publication sur le Play Store (le debug est désormais signé de façon stable, cf. « Signature de l'APK » ci-dessous — reste la signature de *release*, le compte développeur et la fiche store)

Les fonctionnalités non encore portées affichent un message clair ("n'est pas encore disponible") plutôt que de planter silencieusement.

## Fiabilité SQLite : le vrai fix de « beginTransactionAlready »

Un premier correctif (sérialiser les appels à `transaction()` via une file `txChain` dans `db.ts`) empêchait deux synchronisations concurrentes de s'entrechoquer, mais laissait un bug plus profond : `@capacitor-community/sqlite` encapsule **chaque** `run()` dans sa propre transaction implicite par défaut (3ᵉ paramètre `transaction`, `true` par défaut côté plugin). Concrètement, dès qu'un `run()` s'exécutait *à l'intérieur* d'un `transaction()` déjà ouvert (import Powens/CSV, catégorisation par lots…), le plugin tentait de rouvrir une transaction sur une connexion qui en avait déjà une active — d'où le crash, de façon déterministe et pas seulement en cas de concurrence. `db.ts`'s `run()` passe désormais explicitement `transaction: false` : une instruction seule reste atomique de toute façon, et à l'intérieur d'un `transaction()` explicite, elle rejoint la transaction déjà ouverte au lieu d'en ouvrir une autre.

## Signature de l'APK et mises à jour en place

Sans configuration explicite, l'Android Gradle Plugin signe les builds *debug* avec `~/.android/debug.keystore`, régénéré aléatoirement sur chaque machine — donc à chaque run CI, puisque `.github/workflows/android-build.yml` tourne sur un runner GitHub Actions éphémère qui en démarre un neuf à chaque fois. Chaque APK publié se retrouvait signé par une clé différente, et Android refuse catégoriquement d'installer une mise à jour signée par une autre clé que celle de la version déjà installée (« App not installed as package conflicts with an existing package ») — d'où l'obligation de désinstaller avant de réinstaller à chaque nouvelle version.

Un keystore de debug dédié est maintenant versionné dans le dépôt (`android/keystore/banquier-debug.keystore`, référencé depuis `android/app/build.gradle`) : ce n'est pas un secret — c'est la pratique standard pour ce cas de figure — et toutes les releases sont désormais signées à l'identique, donc s'installent en mise à jour normale les unes sur les autres.

⚠️ Cette transition elle-même demande encore une désinstallation manuelle (changement de clé de signature, inévitable). Toutes les versions **suivantes** s'installeront en mise à jour normale.

`versionCode`/`versionName` sont aussi devenus dynamiques (dérivés de `package.json`, au lieu d'être figés à `1`/`"1.0"` pour toutes les releases) : certains outils d'installation refusent une mise à jour dont le `versionCode` n'augmente pas.

## Vérification de mise à jour

`src/mobile/updater.ts` interroge l'API GitHub Releases (`/repos/jessux/Banquier/releases/latest`) et compare au numéro de version embarqué. Contrairement au desktop (`electron-updater`, téléchargement + installation automatique en arrière-plan), il n'y a pas d'installation silencieuse sur Android : ça demanderait la permission `REQUEST_INSTALL_PACKAGES` et un flux de téléchargement/installation natif dédié, jamais implémenté ni testé sur un appareil réel. Le bouton « Vérifier les mises à jour » des Paramètres ouvre donc le lien de téléchargement direct de l'APK dans le navigateur ; l'utilisateur l'installe ensuite manuellement, comme n'importe quelle APK téléchargée.

**Pourquoi `window.open(url, '_blank')` et pas `Browser.open` (`@capacitor/browser`).** Une première version ouvrait le lien via `Browser.open`, qui lance une Chrome Custom Tab. Symptôme observé : le téléchargement de l'APK reste bloqué à 100 % (taille finale atteinte) sans jamais se marquer comme terminé, en particulier avec un signal 4G faible — alors que le même lien copié dans Chrome (navigateur complet, hors Custom Tab) se télécharge normalement. `window.open` laisse le `WebViewClient` par défaut de Capacitor déléguer l'URL au navigateur système via une intent `ACTION_VIEW` classique, exactement comme un lien tapé manuellement, ce qui contourne le comportement des Custom Tabs sur ce cas précis. `powens-webview.ts` continue en revanche d'utiliser `Browser.open` pour l'OAuth Powens : la Custom Tab y est nécessaire pour capter le deep link de retour (`banquier://powens-callback`).

## Icône de l'app

L'icône Android était encore le placeholder par défaut du template Capacitor (fond gris quadrillé + mascotte Android). Elle a été remplacée par le logo « B » (lettre blanche en gras sur fond indigo `#6366F1`, la couleur `--accent` de l'app), généré par script (`PIL`/Pillow) à toutes les densités mipmap, en respectant la zone de sécurité de l'icône adaptative Android (cercle centré ~55 % du canevas, pour ne rien perdre selon la forme de masque du lanceur). Les vecteurs `drawable/ic_launcher_background.xml` et `drawable-v24/ic_launcher_foreground.xml` du template — orphelins, non référencés par l'icône adaptative (`mipmap-anydpi-v26/ic_launcher.xml` pointe vers `@color/ic_launcher_background` et `@mipmap/ic_launcher_foreground`) — ont été supprimés. Le splash screen (`drawable*/splash.png`) reste le placeholder Capacitor par défaut, non traité dans cette passe.

## Pass mobile UI (thème + adaptation tactile)

Une revue systématique de toutes les pages a corrigé deux catégories de problèmes :

- **Couleurs codées en dur cassant le thème clair.** Plusieurs composants (`Categories.tsx`, `Chat.tsx`, `Rules.tsx`, `OnboardingModal.tsx`, `Dashboard.tsx`, `Budget.tsx`, `Transactions.tsx`) fixaient des teintes calibrées uniquement pour le thème sombre (`#171a24`, `#1e2130`, `#161927`, `#13151f`, `#2a1a1a`, `#3e4259`, `#a78bfa`, `#8b93a7`, `#2e3147xx`…) au lieu des variables CSS (`var(--bg)`, `var(--bg3)`, `var(--border)`, `var(--text3)`, `var(--text4)`, `var(--accent)`…). Le plus visible : le fond de toute la modale d'onboarding restait sombre même en thème clair.
- **Tableaux non scrollables sur mobile.** `Patrimoine.tsx`, `Simulateur.tsx` et le tableau de correspondance de colonnes d'`Import.tsx` rendaient un `<table>` brut sans le conteneur `.table-wrapper` (`overflow-x: auto`) déjà utilisé par `Transactions.tsx`/`Rules.tsx`/`Recurring.tsx`/`Comparaison.tsx` — sur un écran étroit, ça pouvait casser la mise en page plutôt que défiler horizontalement.

Non traité dans cette passe (limite du temps disponible, à reprendre si besoin) : les actions révélées uniquement au survol (`onMouseEnter`/`onMouseLeave`, ex. le raccourci « exclure × » du Dashboard) restent invisibles au toucher — l'action elle-même fonctionne au tap (le `onClick` du parent), seul l'indice visuel n'apparaît pas sur mobile.

## Builder l'APK

Le SDK Android n'est pas requis en local pour toucher au code TypeScript (`npm run typecheck:mobile`, `npm run build:android` scaffoldent/synchronisent le projet Capacitor sans compiler la partie native). Compiler un `.apk` réel nécessite un SDK Android complet — c'est `.github/workflows/android-build.yml` qui s'en charge, selon trois déclencheurs :

| Quand | Ce que ça produit |
|---|---|
| Push/PR sur `main` touchant `android/`, `src/mobile/`, etc. | Un artefact CI `banquier-android-debug` (onglet Actions du run — expire, et exige d'être connecté à GitHub) |
| Release officielle créée par release-please | L'APK est **attaché à la release**, à côté des installeurs Windows/Mac/Linux (même mécanique que `build-installers.yml`) |
| Tag `android-preview-*` poussé, ou lancement manuel du workflow | Une **pre-release** dédiée avec l'APK, pour un build de test hors cycle de release |

L'APK est renommé `banquier-<tag>.apk` avant publication.

Pour builder toi-même avec Android Studio :

```bash
npm run build:android
npx cap open android   # ouvre le projet dans Android Studio
```

## iOS

Tout le code de `src/mobile/` (SQLite, parsing CSV, IA/chat, sync Powens, notifications…) est déjà multiplateforme puisqu'il passe exclusivement par les plugins Capacitor — c'est le même code qui tourne sur Android et iOS, sans branche `if (platform === 'android')`. Ce qui manquait, c'était le projet natif iOS lui-même.

Ce qui a été ajouté :

- `ios/` — projet Xcode généré par `npx cap add ios` (dépendance `@capacitor/ios`, gestion des plugins natifs via Swift Package Manager, pas de CocoaPods)
- Le schéma d'URL `banquier://` déclaré dans `Info.plist` (`CFBundleURLTypes`), équivalent iOS de l'intent-filter Android pour la redirection Powens (`banquier://powens-callback`, voir `src/mobile/powens-webview.ts`) — `AppDelegate.swift` relaie déjà l'ouverture d'URL au plugin `@capacitor/app` sans modification nécessaire
- Icône de l'app (même logo « B » que Android/desktop, aplati sur fond indigo plein `#6366F1` — un icône iOS ne peut pas avoir de canal alpha)
- Un schéma Xcode partagé (`App.xcscheme`) commité, pour que `xcodebuild` puisse builder en CI sans jamais ouvrir le projet dans l'IDE
- `npm run build:ios` (équivalent de `build:android`) et `.github/workflows/ios-build.yml`

### Attaché aux releases, comme l'APK — avec une grosse différence

`.github/workflows/ios-build.yml` est appelé depuis `release-please.yml` exactement comme `android-build.yml` : chaque release officielle se voit attacher un zip `banquier-ios-simulator-<tag>.zip`, en plus des installeurs desktop et de l'APK. Mêmes déclencheurs qu'Android (push/PR sur `main`, tag `ios-preview-*`, lancement manuel).

⚠️ **Ce zip n'est pas l'équivalent de l'APK.** Il contient un `App.app` buildé pour le **simulateur iOS** (`CODE_SIGNING_ALLOWED=NO`, voir plus bas) : il ne s'ouvre que dans Xcode → simulateur, sur un Mac. Contrairement à l'APK, **impossible de l'installer sur un iPhone physique** — Apple l'interdit sans signature. Il est attaché aux releases parce que c'est un artefact de build reproductible (utile pour vérifier que le projet compile, ou tester en simulateur), pas parce que c'est une distribution utilisateur final comme l'APK.

### Pas encore fait

- **Aucune signature.** Contrairement à l'APK Android (signé avec un keystore de debug versionné, installable directement), Apple exige une signature pour installer quoi que ce soit sur un iPhone — même en debug. Sans compte développeur Apple (99$/an), impossible de produire un build installable sur un device réel. `.github/workflows/ios-build.yml` build donc uniquement pour le **simulateur iOS** (`CODE_SIGNING_ALLOWED=NO`), ce qui vérifie que le projet compile mais ne produit rien d'installable sur un vrai iPhone. Pour aller plus loin (TestFlight, App Store) il faudra : un compte développeur Apple, un certificat de distribution + provisioning profile, et probablement `fastlane match` ou l'équivalent pour gérer ça en CI.
- **Jamais testé**, ni sur simulateur ni sur device réel — cet environnement de développement n'a ni macOS ni Xcode.
- **Splash screen** : placeholder Capacitor par défaut, comme sur Android (non traité).
- **Universal Links** non configurés — on réutilise le même schéma d'URL personnalisé `banquier://` que sur Android plutôt qu'un vrai universal link (`https://…`), plus simple (pas besoin d'héberger un fichier `apple-app-site-association`) mais Safari affiche une confirmation avant de basculer vers l'app.
- **Versionning statique** : `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` restent figés (`1`/`1.0`) — contrairement à Android où `versionCode`/`versionName` sont dérivés dynamiquement de `package.json`. Pas critique tant qu'il n'y a pas de vraie distribution à versionner (TestFlight/App Store).
- **Roadmap Phases 4-7** (patrimoine, import PDF, récurrences/comparaison/simulateur, publication store) — identique à Android, pas commencée côté iOS non plus, en plus du chantier signature/distribution qui lui est propre.

Pour builder toi-même avec Xcode (sur un Mac) :

```bash
npm run build:ios
npx cap open ios   # ouvre le projet dans Xcode
```
