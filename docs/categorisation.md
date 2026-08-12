# Chantier : réduire à néant la pénibilité de la catégorisation

> **Fichier de suivi.** Il porte l'état d'avancement, les décisions prises et la
> façon de reprendre après une pause. À mettre à jour à chaque étape terminée.

**Branche** : `claude/categorization-friction-reduction-tce8bm`
**Base** : `main` @ 93198ee (1.33.0 + revert des packs de règles)

---

## Objectif

Que la question « quelle catégorie ? » ne soit plus posée. Le premier import
demande un peu de travail ; les suivants doivent être silencieux.

**Métrique de pilotage** : *% de transactions catégorisées sans aucune
intervention*, affiché dans les réglages. Cible > 95 % au régime de croisière.

---

## Le diagnostic (état initial, avant ce chantier)

| # | Friction | Cause dans le code |
|---|---|---|
| 1 | On revalide les mêmes marchands chaque mois | aucune mémoire marchand → catégorie |
| 2 | 40 tx CARREFOUR = 40 lignes au LLM et 40 cases à cocher | pas de dédup avant l'appel (`ipc.ts` `categorize-ai`) |
| 3 | Créer une règle = écrire une **regex** | `Rules.tsx` — barrière rédhibitoire |
| 4 | La catégorisation est une action à déclencher | seules les règles tournent à l'import |
| 5 | Validation à plat, 200 cases équivalentes | proposals bruts, tous `accepted: true` |

Le point aveugle central : `updateTransactionCategory` propageait avec
`WHERE description = ?` (égalité stricte). Un libellé bancaire réel
(`CB CARREFOUR MARKET 12/03 PARIS 4589`) étant quasi unique, la correction de
l'utilisateur ne servait jamais au mois suivant.

Second point aveugle : `normalizeMerchant` existait déjà mais n'était utilisé
que pour l'écran « Top marchands » — l'actif central du problème, inexploité.

---

## Architecture cible : cascade à confiance décroissante

Le LLM devient le dernier recours, pas le moteur.

```
import
  ↓
[0] clé marchand (normalisation du libellé)
  ↓
[1] règles utilisateur (regex explicites)      ─ déterministe
  ↓
[2] mémoire marchand (tes décisions passées)   ─ local, instantané, gratuit
  ↓
[3] dictionnaire FR embarqué (~300 enseignes)  ─ statique, versionné
  ↓
[4] repli flou BM25 sur l'historique classé    ─ local
  ↓
[5] LLM — sur les MARCHANDS UNIQUES restants   ─ 1 appel au lieu de 10
  ↓
[6] revue groupée par marchand, triée par impact €
```

Chaque couche qui tranche écrit dans la **mémoire marchand** : la même question
ne se repose jamais.

---

## Avancement

Légende : ☐ à faire · ◐ en cours · ☑ fait

### Phase 0 — Fondation : clé marchand ☑ *(commit `feat(categorisation): cle marchand`)*
- ☑ `src/shared/merchant.ts` — `normalizeMerchant()` sorti de `database.ts` et durci (accents, jetons chiffrés, formes juridiques, initiales isolées)
- ☑ Colonne `transactions.merchant_key` + index + backfill par migration
- ☑ Calcul à l'insertion (un seul point d'entrée : `insertTransactions`, donc CSV/PDF/Powens couverts)
- ☑ Tests unitaires sur la normalisation + tests base (insertion, regroupement, backfill)
- ☑ Parité mobile (`src/mobile/db.ts`, `api/transactions.ts`, `api/dashboard.ts`)

Effet de bord voulu : « Top marchands » et la détection de récurrences
utilisent désormais la même normalisation que le reste — les trois
regroupaient auparavant avec deux implémentations dupliquées.

### Phase 1 — Mémoire marchand ☑ *(le gain principal)*
- ☑ Table `merchant_categories(merchant_key, category, count, last_used)`
- ☑ Écriture à chaque décision : correction manuelle, proposition IA validée, catégorisation en masse par regex
- ☑ Application automatique à l'import, via `autoCategorize()` — point d'entrée unique de la cascade, remplaçant les 8 appels dispersés à `applyRulesToTransactions`
- ☑ Amorçage depuis l'historique déjà catégorisé (une seule fois, à la création de la table)
- ☑ Propagation des renommages de catégorie à la mémoire
- ☑ Tests (8 cas) + parité mobile

Décisions au passage :
- **La dernière décision fait foi** plutôt qu'un vote majoritaire : qui vient de
  corriger attend que sa correction tienne.
- **La mémoire ne réécrit jamais une catégorie déjà posée** — elle complète, elle
  n'écrase pas.
- **`applyToSimilar` juge désormais sur la clé marchand** et non plus sur
  l'égalité stricte du libellé, qui ne rattrapait quasiment jamais rien.
- Les **règles priment sur la mémoire** (explicites, elles peuvent réécrire).
- Une règle ne nourrit pas la mémoire : elle est déjà rejouée à chaque import,
  l'y dupliquer créerait deux sources de vérité pour un même marchand.

### Phase 2 — Dédup LLM par marchand
- ☐ Regrouper les non-catégorisées par `merchant_key` avant l'appel
- ☐ Un représentant par groupe, résultat étendu à tout le groupe
- ☐ Score de confiance demandé au modèle
- ☐ Écriture du résultat en mémoire marchand (pas seulement sur les tx du lot)

### Phase 3 — Dictionnaire FR embarqué
- ☐ `src/shared/merchantDictionary.ts` (~300 enseignes + motifs génériques)
- ☐ Aligné sur `DEFAULT_CATEGORY_TREE`, priorité inférieure à la mémoire perso
- ☐ Tests

### Phase 4 — Revue groupée par marchand
- ☐ Cartes « MARCHAND — n tx — total € — catégorie », triées par impact décroissant
- ☐ Auto-acceptation au-dessus du seuil de confiance
- ☐ Navigation clavier

### Phase 5 — Traçabilité et mode automatique
- ☐ Colonnes `category_source` (`user`/`rule`/`memory`/`dict`/`fuzzy`/`ai`) et `category_confidence`
- ☐ Réglage « catégorisation automatique à l'import »
- ☐ Badge « n à vérifier » dans la sidebar
- ☐ Métrique « % sans intervention » dans les réglages

### Phase 6 — Repli flou local
- ☐ BM25 (réutilise `src/main/memory.ts`) sur l'historique catégorisé
- ☐ Seuil haut → appliqué, seuil bas → proposé

### Phase 7 — Gains annexes
- ☐ Détection des virements internes (montants opposés à ±3 j entre comptes propres)
- ☐ Règles en mode « le libellé contient X », regex reléguée en avancé
- ☐ Suggestion de règle après corrections répétées

### Parité mobile
- ☐ Phases 0-1 portées dans `src/mobile/db.ts` + `src/mobile/api/`
- ☐ Phase 2-3 portées dans `src/mobile/llm.ts`

---

## Décisions prises

- **Pas de packs de règles communautaires.** Retirés en #95 : la moitié
  « partage » reposait sur une heuristique « nom de personne vs enseigne » sans
  solution fiable. Le dictionnaire de la phase 3 est **statique, curé et
  versionné dans le repo** — rien n'est envoyé, rien n'est partagé, le problème
  ne se pose pas.
- **La mémoire de l'utilisateur prime toujours sur le dictionnaire embarqué.**
- **Le LLM ne s'applique jamais seul sans validation** tant que la phase 5
  (mode automatique explicite + traçabilité + annulation) n'est pas livrée.
- **Rejet d'un lot LLM plutôt que mauvais classement** : le garde-fou de
  `parseCategorizationResponse` est conservé.

---

## Reprendre après une pause

```bash
git checkout claude/categorization-friction-reduction-tce8bm
git log --oneline -5     # dernière phase livrée
npm test                 # doit être vert avant de repartir
```

Puis reprendre à la première case non cochée ci-dessus. Les phases sont
indépendantes et livrées une par une : l'application reste fonctionnelle entre
chaque.
