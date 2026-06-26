# 🏦 Banquier

> **Vos relevés bancaires enfin sous contrôle — localement, intelligemment, sans abonnement.**

### ⬇️ Télécharger Banquier

- **[➡️ Dernière version (installeur Windows)](https://github.com/jessux/Banquier/releases/latest)** — le plus simple, téléchargez le `.exe` et lancez-le
- **[📜 Toutes les versions / historique des releases](https://github.com/jessux/Banquier/releases)** — versions précédentes et notes de version

> Astuce : dans la page d'une release, le fichier d'installation se trouve dans la section **« Assets »** (cliquez pour la déplier), c'est le fichier qui se termine par `.exe`.

Banquier est une application de bureau qui importe vos relevés (CSV, PDF), les catégorise automatiquement par IA, et vous donne une vision claire de vos finances. Tout tourne sur votre machine. Vos données ne quittent jamais votre disque.

---

## Pourquoi Banquier ?

Les apps de gestion de budget en ligne sont pratiques — jusqu'au jour où elles revendent vos données, augmentent leurs tarifs, ou ferment. Banquier prend le contre-pied : **open source, 100 % local, zéro abonnement**.

- Vos relevés restent sur votre machine (SQLite dans `AppData`)
- Aucun compte à créer, aucun serveur tiers
- L'IA est optionnelle et vous choisissez votre modèle

---

## Ce que ça fait

| Fonctionnalité | Détail |
|---|---|
| 📥 **Import** | CSV et PDF depuis n'importe quelle banque française |
| 🤖 **Catégorisation IA** | OpenRouter classe vos transactions en un clic |
| 📋 **Règles automatiques** | "AMAZON → Shopping" pour ne jamais recatégoriser deux fois |
| 📊 **Dashboard** | Dépenses, revenus, tendances mois par mois |
| 💬 **Chat financier** | Posez des questions en langage naturel sur vos finances |
| 🏦 **Multi-comptes** | Courant, épargne, multi-devises |
| 🔒 **Vie privée** | Données 100 % locales, rien dans le cloud |

---

## Stack

```
Electron 31 · React 18 · TypeScript · SQLite (WASM) · Vite · OpenRouter
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

---

## Sauvegarder et restaurer vos données

Toutes vos données sont dans un seul fichier SQLite. Banquier vous donne deux façons de les exporter depuis **Paramètres → Export**.

### Export SQLite (sauvegarde complète)

Exporte une copie exacte de la base : transactions, catégories, règles, comptes. Fichier produit : `banquier-backup-YYYY-MM-DD.db`.

**Restaurer une sauvegarde** — l'import de `.db` n'est pas encore dans l'interface. Pour restaurer manuellement :

1. Quittez Banquier
2. Remplacez le fichier `banquier.db` dans le dossier `userData` par votre sauvegarde :
   ```
   %APPDATA%\banquier\banquier.db   ← Windows
   ```
3. Relancez l'application

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

```bash
set HTTPS_PROXY=http://proxy.entreprise.com:8080
npm run dev
```

Les appels OpenRouter passent automatiquement par le proxy.

---

## Structure du projet

```
src/
├── main/           # Processus Electron
│   ├── database.ts # SQLite — comptes, transactions, catégories
│   ├── ipc.ts      # API IPC exposée au renderer
│   ├── llm.ts      # Streaming, tool calls, catégorisation par lot
│   └── parsers/    # CSV (PapaParse) · PDF (pdf-parse)
├── preload/        # Bridge contextIsolation
├── renderer/       # React — Dashboard, Import, Chat, Transactions…
└── shared/types.ts # Types partagés main ↔ renderer
```

---

*Fait pour ceux qui veulent comprendre où passe leur argent — sans payer pour ça.*
