# Banquier

Application de bureau pour gérer et analyser vos relevés bancaires, construite avec Electron, React et SQLite.

## Fonctionnalités

- **Import** de relevés au format CSV et PDF
- **Catégorisation** automatique des transactions via IA (OpenRouter) ou manuelle
- **Règles** de catégorisation automatiques par pattern
- **Dashboard** avec graphiques de dépenses/revenus et tendances mensuelles
- **Chat financier** : posez des questions sur vos finances à un conseiller IA
- **Stockage local** : toutes les données restent sur votre machine (SQLite)
- **Multi-comptes** avec support multi-devises

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Shell  | Electron 31 |
| UI     | React 18 + TypeScript |
| Build  | electron-vite + Vite 5 |
| Base de données | SQLite (node-sqlite3-wasm) |
| IA     | OpenRouter API (streaming + tool calls) |
| Parsing | PapaParse (CSV), pdf-parse (PDF) |
| Graphiques | Recharts |

## Prérequis

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

## Build

```bash
# Build uniquement
npm run build

# Installeur Windows (.exe via NSIS)
npm run build:win

# Dossier non packagé (pour tester rapidement)
npm run build:win:dir
```

## Configuration IA

L'application utilise [OpenRouter](https://openrouter.ai) pour les fonctionnalités d'IA (catégorisation automatique et chat financier).

1. Créez un compte sur openrouter.ai et générez une clé API
2. Dans l'application, allez dans **Paramètres**
3. Renseignez votre clé API et choisissez un modèle (ex. `anthropic/claude-sonnet-4-5`)

La clé est stockée localement via `electron-store` et ne quitte jamais votre machine (sauf lors des appels à l'API OpenRouter).

## Données & vie privée

- La base de données SQLite est stockée dans le dossier `userData` d'Electron (ex. `%APPDATA%\banquier` sur Windows)
- Aucune donnée n'est envoyée à un serveur tiers, à l'exception des appels à l'API OpenRouter si la fonctionnalité IA est utilisée
- Le repo git ne contient aucune donnée bancaire ni clé API

## Structure du projet

```
src/
├── main/           # Processus principal Electron
│   ├── database.ts # Modèle SQLite (comptes, transactions, catégories)
│   ├── ipc.ts      # Handlers IPC exposés au renderer
│   ├── llm.ts      # Intégration OpenRouter (streaming, tool calls, catégorisation)
│   └── parsers/    # Parseurs CSV et PDF
├── preload/        # Bridge contextIsolation
├── renderer/       # Interface React
│   └── src/
│       ├── pages/  # Dashboard, Transactions, Import, Chat, Catégories, Règles, Paramètres
│       └── components/
└── shared/         # Types TypeScript partagés main ↔ renderer
```

## Proxy d'entreprise

Si vous êtes derrière un proxy, définissez la variable d'environnement `HTTPS_PROXY` (ou `HTTP_PROXY`) avant de lancer l'application. Les appels OpenRouter passeront automatiquement par le proxy.

```bash
set HTTPS_PROXY=http://proxy.entreprise.com:8080
npm run dev
```
