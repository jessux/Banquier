# Guide technique / développement

Ce document regroupe les informations destinées aux développeurs (stack, build, structure du code). Pour une présentation générale de l'application, voir le [README](../README.md).

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

```bash
npm run build:android    # electron-vite build + npx cap sync android
```

Voir [`docs/mobile.md`](mobile.md) pour le détail phase par phase, l'architecture du portage (`src/mobile/`) et la roadmap.

### iOS

```bash
npm run build:ios        # electron-vite build + npx cap sync ios
```

Portage au stade scaffolding (projet Xcode généré, schéma d'URL configuré) : pas encore signé, pas testé même en simulateur. Chaque release publie un build simulateur (`banquier-ios-simulator-*.zip`) à ouvrir dans Xcode sur un Mac — voir [`docs/mobile.md#ios`](mobile.md#ios).

---

## Proxy d'entreprise (développement)

Banquier détecte automatiquement le proxy configuré dans Windows (Internet Options / registre). Pour le forcer en développement (prioritaire sur le proxy système) :

```bash
set HTTPS_PROXY=http://proxy.entreprise.com:8080
npm run dev
```

Les appels OpenRouter et Powens passent tous les deux par le proxy détecté.

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

## Tests et limites connues

`vitest` couvre les parsers CSV, la logique de récurrences/règles/comparaison/budgets dans `database.ts`, et la validation des réponses IA dans `llm.ts`. `ipc.ts`, `powens.ts`, `quotes.ts` et le renderer React n'ont pas encore de tests.

```bash
npm test          # vitest run
npm run test:watch
```

Voir [`docs/limitations.md`](limitations.md) pour l'état complet du projet.
