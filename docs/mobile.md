# Banquier sur Android

Banquier existe désormais en app Android native (via [Capacitor](https://capacitorjs.com)), en plus de la version desktop Electron. C'est un chantier en plusieurs phases — voici où ça en est.

## Comment ça marche

L'interface (React/Vite) est la même que sur desktop, mais tourne dans une WebView native au lieu d'Electron. Côté données, l'app Android ne parle plus à un process Electron via IPC : elle embarque sa propre base SQLite locale sur le téléphone (`@capacitor-community/sqlite`) et implémente directement en JS/TS ce que le process principal Electron fait pour desktop. Le code correspondant vit dans `src/mobile/` :

- `src/mobile/db.ts` — connexion SQLite + schéma
- `src/mobile/api/` — port des fonctions de `src/main/database.ts` utiles aux Phases 1-3
- `src/mobile/parsers/csv.ts` — parsing CSV (port de `src/main/parsers/csv.ts`)
- `src/mobile/llm.ts` — chat financier + catégorisation IA (port de `src/main/llm.ts`, LangChain/OpenRouter)
- `src/mobile/powens.ts`, `src/mobile/powens-webview.ts`, `src/mobile/powens-sync.ts` — synchronisation bancaire Powens (port de `src/main/powens.ts`)
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

⚠️ **Non vérifié sur un appareil réel** : cet environnement de développement n'a pas de SDK Android ni d'accès à un vrai flux bancaire Powens pour tester la connexion de bout en bout. Powens n'exige pas d'enregistrement préalable strict du `redirect_uri` pour ce widget (le desktop utilise déjà un `http://localhost` qui n'écoute jamais), donc un schéma custom devrait fonctionner de la même façon — mais ça reste à confirmer sur un téléphone.

## Pas encore disponible sur mobile (roadmap)

- **Phase 4** — Patrimoine, actifs, plans DCA, cours (crypto/bourse)
- **Phase 5** — Import PDF
- **Phase 6** — Pages Récurrences, Comparaison, Simulateur
- **Phase 7** — Pipeline de release signée (keystore, publication Play Store)

Les fonctionnalités non encore portées affichent un message clair ("n'est pas encore disponible") plutôt que de planter silencieusement.

## Builder l'APK

Le SDK Android n'est pas requis en local pour toucher au code TypeScript (`npm run typecheck:mobile`, `npm run build:android` scaffoldent/synchronisent le projet Capacitor sans compiler la partie native). Compiler un `.apk` réel nécessite un SDK Android complet — c'est ce que fait `.github/workflows/android-build.yml` à chaque push sur `main` touchant `android/`, `src/mobile/`, etc. : il produit un artefact `banquier-android-debug` téléchargeable depuis l'onglet Actions du run correspondant.

Pour builder toi-même avec Android Studio :

```bash
npm run build:android
npx cap open android   # ouvre le projet dans Android Studio
```
