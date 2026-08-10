# 🏦 Banquier

> **Vos relevés bancaires enfin sous contrôle — sans abonnement, sans revente de données.**

### ⬇️ Télécharger Banquier

- **[➡️ Dernière version (installeur Windows)](https://github.com/jessux/Banquier/releases/latest)** — le plus simple, téléchargez le `.exe` et lancez-le
- **[🍎 macOS](https://github.com/jessux/Banquier/releases/latest)** — le fichier `.dmg` de la même release (build non signé, voir note ci-dessous)
- **[🐧 Linux](https://github.com/jessux/Banquier/releases/latest)** — `.AppImage` (portable) ou `.deb` (Debian/Ubuntu) de la même release
- **[📱 Android](https://github.com/jessux/Banquier/releases/latest)** — le fichier `.apk` de la même release (voir [`docs/mobile.md`](docs/mobile.md) pour les fonctionnalités déjà portées)
- **[📜 Toutes les versions / historique des releases](https://github.com/jessux/Banquier/releases)** — versions précédentes et notes de version

> Astuce : dans la page d'une release, les fichiers se trouvent dans la section **« Assets »** (cliquez pour la déplier) : `.exe` pour Windows, `.dmg` pour macOS, `.AppImage`/`.deb` pour Linux, `.apk` pour Android.

> **macOS** : le build n'est pas signé (pas de compte développeur Apple). Gatekeeper bloquera l'ouverture directe — clic droit → Ouvrir, ou `xattr -cr /Applications/Banquier.app` après installation.

Banquier est une application de bureau qui importe vos relevés (CSV, PDF), les catégorise automatiquement par IA, et vous donne une vision claire de vos finances. Tout tourne sur votre machine. Vos données ne quittent jamais votre disque.

---

## Pourquoi Banquier ?

Les apps de gestion de budget en ligne sont pratiques — jusqu'au jour où elles revendent vos données, augmentent leurs tarifs, ou ferment. Banquier prend le contre-pied : **open source, zéro abonnement, vos données sous votre contrôle**.

- Vos relevés restent sur votre machine (SQLite dans `AppData`)
- Le cœur de l'application fonctionne **100 % hors ligne** (import CSV/PDF, catégories, règles, budgets, récurrences, comparaison, simulateur)
- Trois fonctionnalités optionnelles font appel à des services externes :
  - **Powens (OpenBanking)** — synchronisation automatique depuis votre banque via l'API Powens
  - **IA (OpenRouter)** — catégorisation assistée et chat financier via un LLM externe
  - **Cotations marché (CoinGecko / Yahoo Finance)** — cours en direct pour le module Patrimoine (actions, ETF, cryptomonnaies)
- Sans ces options, aucune donnée ne quitte votre machine

---

## Ce que ça fait

| Fonctionnalité | Détail |
|---|---|
| 🚀 **Onboarding** | Assistant pas-à-pas : connexion Powens ou import manuel, transactions, catégorisation, IA |
| 📥 **Import** | CSV et PDF depuis n'importe quelle banque française — le parsing est 100 % local, aucune donnée envoyée en ligne |
| 🤖 **Catégorisation IA** | OpenRouter propose une catégorie par transaction (avec recherche web) ; vous cochez/corrigez les propositions avant qu'elles soient écrites en base — rien n'est appliqué automatiquement |
| 📋 **Règles automatiques** | Motifs regex → catégorie ("AMAZON → Shopping"), appliqués à chaque import et rejouables à la demande |
| 🔍 **Filtres avancés** | Recherche, catégorie, compte, date, montant min/max, tags, virements internes |
| 📄 **Pagination** | Affichage 75 transactions/page, tri serveur — fluide même sur 10 000+ entrées |
| 📊 **Dashboard** | Dépenses, revenus, tendances mois par mois, répartition par catégorie, top marchands + aperçu des budgets |
| 🎯 **Budgets** | Plafonds mensuels par catégorie, montant suggéré automatiquement, alertes visuelles de dépassement |
| 🔁 **Récurrences** | Détection automatique des abonnements/prélèvements récurrents, statut actif/probablement résilié, coût mensuel/annuel estimé |
| ⚖️ **Comparaison** | Compare les dépenses par catégorie entre deux périodes (mois, année ou plage personnalisée) |
| 💰 **Patrimoine** | Suivi multi-actifs (immobilier, actions, ETF, crypto, liquidités, assurance-vie…) avec cours en direct, lots d'achat, plan d'investissement programmé (DCA) et historique de valeur nette |
| 🧮 **Simulateur** | Calcul d'intérêts composés pour l'épargne programmée (versement nécessaire ↔ capital final) |
| 💬 **Chat financier** | Assistant IA multi-conversations avec mémoire, streaming et appel d'outils sur vos données réelles |
| 🏦 **Multi-comptes** | Courant, épargne, multi-devises avec taux de conversion saisi manuellement |
| 📝 **Notes & Tags** | Annotez et taguez vos transactions librement |
| 👤 **Profils** | Plusieurs profils indépendants sur une même installation, chacun avec sa propre base SQLite (ex. perso / pro) |
| 📱 **Accès mobile web** | Mini-dashboard en lecture seule consultable depuis un téléphone via QR code (serveur local, sans passer par l'app mobile) |
| 🔒 **Vie privée** | Données stockées localement (SQLite) — IA, Powens et cotations Patrimoine sont les 3 seules fonctions qui contactent des services externes, et restent optionnelles |

---
## Soutenir le projet

Si Banquier vous est utile, vous pouvez soutenir son développement sur [Ko-fi](https://ko-fi.com/gabrielkahlouche).

---
## Stack

```
Electron 31 · React 18 · TypeScript · SQLite (WASM) · Vite · Capacitor (Android/iOS)
LangChain / OpenRouter · Powens · CoinGecko & Yahoo Finance
```

---

## Démarrage rapide

```bash
# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev
```

### Build Windows

```bash
npm run build:win        # installeur .exe (NSIS)
npm run build:win:dir    # dossier non packagé (test rapide)
```

### Android

Banquier est aussi disponible en app Android, avec l'essentiel des fonctionnalités desktop portées : cœur hors-ligne (comptes, transactions, import CSV, catégories, règles, budgets, dashboard), catégorisation IA et chat, sync Powens, Patrimoine, import PDF, récurrences/comparaison/simulateur. Seul le cœur hors-ligne est aujourd'hui validé en usage réel ; le reste fonctionne mais n'a pas encore été testé de bout en bout sur un appareil physique. Voir [`docs/mobile.md`](docs/mobile.md) pour le détail phase par phase et la roadmap.

### iOS

Le portage iOS est un scaffolding (projet Xcode généré, schéma d'URL configuré) : pas encore signé, pas encore testé même en simulateur, et sans aucune des fonctionnalités métier vérifiées sur cette plateforme (voir [`docs/mobile.md#ios`](docs/mobile.md#ios)). Chaque release publie un build simulateur (`banquier-ios-simulator-*.zip`, à ouvrir dans Xcode sur un Mac) dans l'onglet [Releases](https://github.com/jessux/Banquier/releases) — pas encore de build installable sur iPhone.

---

## Sauvegarder et restaurer vos données

Toutes vos données sont dans un seul fichier SQLite. Banquier vous donne deux façons de les exporter depuis **Paramètres → Export**.

### Export SQLite (sauvegarde complète)

Exporte une copie exacte de la base : transactions, catégories, règles, comptes, budgets. Fichier produit : `banquier-backup-YYYY-MM-DD.db`.

**Restaurer une sauvegarde** — depuis **Paramètres → Données → Restaurer une sauvegarde…** :

1. Cliquez sur "Restaurer une sauvegarde…" et confirmez
2. Sélectionnez votre fichier `.db`
3. L'application recharge automatiquement avec les données restaurées

Vous pouvez aussi restaurer manuellement (application fermée) en remplaçant :
```
%APPDATA%\banquier\banquier.db   ← Windows
```

### Export CSV (transactions uniquement)

Exporte toutes vos transactions dans un fichier `transactions-YYYY-MM-DD.csv` — pratique pour ouvrir dans Excel ou migrer vers un autre outil.

> **Emplacement de la base de données**
> ```
> Windows : %APPDATA%\banquier\banquier.db
> ```
> Vous pouvez copier ce fichier à tout moment (application fermée) pour faire une sauvegarde manuelle.

---

## Configurer l'IA (optionnel)

L'IA tourne via [OpenRouter](https://openrouter.ai) — un seul accès pour des dizaines de modèles (Claude, GPT-4, Mistral…).

1. Créez un compte sur **openrouter.ai** et générez une clé API
2. Dans Banquier : **Paramètres → Clé API**
3. Choisissez votre modèle (recommandé (gratuit): `openrouter/free`)

Sans clé API, tout le reste de l'application fonctionne normalement.

---

## Proxy d'entreprise

Banquier détecte automatiquement le proxy configuré dans Windows (Internet Options / registre) — aucune action requise dans la plupart des cas.

Si nécessaire, vous pouvez forcer un proxy via variable d'environnement (prioritaire sur le proxy système) :

```bash
set HTTPS_PROXY=http://proxy.entreprise.com:8080
npm run dev
```

Les appels OpenRouter et Powens passent tous les deux par le proxy détecté.

---

## Limites connues

Le projet est fonctionnel mais tout n'a pas le même niveau de maturité (tests, portage mobile, signature macOS…) — détail dans [`docs/limitations.md`](docs/limitations.md).

---

## Structure du projet

```
src/
├── main/                 # Processus Electron
│   ├── database.ts       # SQLite — comptes, transactions, catégories, budgets, patrimoine…
│   ├── ipc.ts             # API IPC exposée au renderer (~90 handlers)
│   ├── llm.ts             # Chat IA, catégorisation par lot, appel d'outils, streaming
│   ├── powens.ts          # OpenBanking — connexion et synchronisation
│   ├── quotes.ts          # Cotations marché (CoinGecko, Yahoo Finance) pour le Patrimoine
│   ├── profiles.ts        # Profils multiples (une base SQLite par profil)
│   ├── mobile-server.ts   # Serveur d'accès mobile en lecture seule (QR code)
│   ├── proxy.ts           # Détection/config du proxy d'entreprise
│   ├── updater.ts         # Mise à jour auto + sauvegarde pré-mise à jour
│   └── parsers/           # CSV (PapaParse) · PDF (pdf-parse)
├── mobile/               # Portage Capacitor (Android/iOS) — logique métier dédiée
├── preload/              # Bridge contextIsolation
├── renderer/             # React — Dashboard, Transactions, Import, Budgets, Patrimoine, Chat…
└── shared/               # Types partagés + parsing PDF partagé main/mobile
```

---

*Fait pour ceux qui veulent comprendre où passe leur argent — sans payer pour ça.*
