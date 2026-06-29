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
| 🚀 **Onboarding** | Assistant pas-à-pas : connexion Powens, transactions, catégorisation, IA |
| 📥 **Import** | CSV et PDF depuis n'importe quelle banque française |
| 🤖 **Catégorisation IA** | OpenRouter classe vos transactions en un clic |
| 📋 **Règles automatiques** | "AMAZON → Shopping" pour ne jamais recatégoriser deux fois |
| 🔍 **Filtres avancés** | Recherche, catégorie, compte, date, montant min/max, tags |
| 📄 **Pagination** | Affichage 75 transactions/page, navigation rapide — fluide même sur 10 000+ entrées |
| 📊 **Dashboard** | Dépenses, revenus, tendances mois par mois + aperçu des budgets |
| 🎯 **Budgets** | Plafonds mensuels par catégorie avec alertes de dépassement |
| 💬 **Chat financier** | Posez des questions en langage naturel sur vos finances |
| 🏦 **Multi-comptes** | Courant, épargne, multi-devises avec taux de conversion |
| 📝 **Notes & Tags** | Annotez et taguez vos transactions librement |
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
