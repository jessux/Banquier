# Banquier sur Android

Banquier existe désormais en app Android native (via [Capacitor](https://capacitorjs.com)), en plus de la version desktop Electron. C'est un chantier en plusieurs phases — voici où ça en est.

## Comment ça marche

L'interface (React/Vite) est la même que sur desktop, mais tourne dans une WebView native au lieu d'Electron. Côté données, l'app Android ne parle plus à un process Electron via IPC : elle embarque sa propre base SQLite locale sur le téléphone (`@capacitor-community/sqlite`) et implémente directement en JS/TS ce que le process principal Electron fait pour desktop. Le code correspondant vit dans `src/mobile/` :

- `src/mobile/db.ts` — connexion SQLite + schéma
- `src/mobile/api/` — port des fonctions de `src/main/database.ts` utiles à la Phase 1
- `src/mobile/parsers/csv.ts` — parsing CSV (port de `src/main/parsers/csv.ts`)
- `src/mobile/window-api.ts` — remplace le `window.api` injecté par le preload Electron
- `src/mobile/entry.ts` — installé automatiquement par `src/renderer/src/main.tsx` quand l'app ne tourne pas sous Electron

Rien dans `src/main/`, `src/preload/` ou les pages de `src/renderer/` n'a été modifié pour ce port (à l'exception d'une ligne d'amorçage conditionnelle dans `main.tsx`) — la build desktop (`npm run dev`, `npm run build:win`) n'est pas affectée.

## Phase 1 (disponible)

Le cœur 100 % hors-ligne de Banquier, sur ta base SQLite locale au téléphone :

- Comptes, transactions (liste/filtre/édition/suppression)
- Import CSV (avec détection de délimiteur/en-tête comme sur desktop)
- Catégories + règles automatiques de catégorisation
- Budgets mensuels
- Tableau de bord (résumé, tendances, top catégories/marchands, non catégorisé)
- Paramètres de base (devise, langue, thème, onboarding)

## Pas encore disponible sur mobile (roadmap)

- **Phase 2** — Catégorisation IA + chat financier (OpenRouter)
- **Phase 3** — Synchronisation bancaire Powens (OAuth mobile via Custom Tabs + deep link)
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
