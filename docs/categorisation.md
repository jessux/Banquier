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

## Architecture : cascade à confiance décroissante

Le LLM devient le dernier recours, pas le moteur.

```
import
  ↓
[0] clé marchand (normalisation du libellé)
  ↓
[1] règles utilisateur                         ─ déterministe, peut réécrire
  ↓
[2] mémoire marchand (vos décisions passées)   ─ local, instantané, gratuit
  ↓
[3] rattrapage flou (marchand voisin)          ─ local
  ↓
[4] dictionnaire FR embarqué (~290 enseignes)  ─ statique, versionné
  ↓
[5] LLM — sur les MARCHANDS UNIQUES restants   ─ 1 appel au lieu de 10
  ↓
[6] revue groupée par marchand, triée par impact €
```

Deux écarts avec le plan d'origine, détaillés plus bas dans les phases
concernées : le rattrapage flou passe **avant** le dictionnaire (une décision de
l'utilisateur, même approchée, prime sur une liste livrée), et il ne repose pas
sur BM25.

Vos décisions — corrections manuelles et propositions IA validées — alimentent
la **mémoire marchand** : la même question ne se repose jamais.

---

## État : chantier terminé

Les huit phases sont livrées, chacune dans son commit, application fonctionnelle
entre chaque. 104 tests, build et typecheck mobile verts.

**Ce que fait la cascade aujourd'hui, à chaque import, sans rien demander :**

| Couche | Origine | Prime sur |
|---|---|---|
| Règles | vos motifs explicites | tout, et peut réécrire |
| Mémoire marchand | vos décisions passées, à l'identique | le reste |
| Rattrapage flou | vos décisions passées, marchand voisin | le dictionnaire |
| Dictionnaire | ~290 enseignes françaises livrées | — |
| LLM | dernier recours, un appel par marchand | rien : il propose |

Le LLM n'écrit jamais sans validation, sauf si le mode automatique est activé —
et alors seulement au-dessus du seuil de confiance.

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

### Phase 2 — Dédup LLM par marchand ☑
- ☑ `groupByMerchant()` dans `src/shared/categorization.ts` — regroupement avant l'appel
- ☑ Un représentant par groupe (la plus grosse transaction), résultat étendu à tout le groupe
- ☑ Score de confiance demandé au modèle, avec repli quand il n'en renvoie pas
- ☑ Écriture du résultat en mémoire marchand — acquis via `batchUpdateCategories` (phase 1)
- ☑ Parseur de réponse remonté dans `shared/` : le mobile avait sa propre copie, **sans le garde-fou de longueur** — il pouvait donc décaler silencieusement les catégories

`CategorizationProposal` porte désormais un marchand et non une transaction :
un relevé de 300 lignes inconnues tient en une quinzaine de propositions.

### Phase 3 — Dictionnaire FR embarqué ☑
- ☑ `src/shared/merchantDictionary.ts` — ~290 enseignes françaises
- ☑ Aligné sur `DEFAULT_CATEGORY_TREE`, priorité inférieure aux règles et à la mémoire
- ☑ Motifs longs d'abord (UBER EATS avant UBER, ORANGE BLEUE avant ORANGE) et bornes de mots (CORA ≠ CORAIL)
- ☑ Entrées orientées débit/crédit : au débit une mutuelle est une dépense, au crédit un remboursement
- ☑ Repli sur la catégorie parente si l'utilisateur a supprimé la sous-catégorie ; aucune catégorie fantôme n'est créée
- ☑ Tests (13 cas) + parité mobile

Le résultat du dictionnaire n'est **pas** recopié en mémoire marchand : il est
déjà rejoué à chaque import, et l'y dupliquer empêcherait une correction
ultérieure du dictionnaire de prendre effet.

### Phase 4 — Revue groupée par marchand ☑ *(livrée avec la phase 2)*
- ☑ Lignes « MARCHAND — n tx — total € — catégorie », triées par impact décroissant
- ☑ Auto-acceptation au-dessus du seuil de confiance (0,8), les autres marqués « à vérifier »
- ☑ Navigation clavier : ↑↓ naviguer, Espace cocher, Entrée appliquer, Échap annuler — rappelée dans le panneau, sinon personne ne la découvre

### Phase 5 — Traçabilité et pilotage ☑
- ☑ Colonne `category_source` (`user`/`rule`/`memory`/`fuzzy`/`dict`/`ai`) renseignée sur tous les chemins d'écriture
- ☑ Métrique « % catégorisées sans intervention » dans les réglages
- ☑ Gestion de la mémoire marchand : liste, filtre, oubli ciblé, oubli total
- ☑ Annulation en bloc par source, sans jamais toucher aux choix manuels
- ☑ Tests (3 cas) + parité mobile
- ☑ Réglage « catégorisation IA automatique à l'import », désactivé par défaut
- ☑ Badge du nombre de transactions sans catégorie dans la sidebar
- ☑ Écran d'import : compte des transactions catégorisées sans intervention

**Écart assumé** : pas de colonne `category_confidence`. Les propositions IA
étant validées une par une avant d'être écrites, la confiance a déjà joué son
rôle au moment de la revue ; la stocker n'aurait servi à rien de plus. Les
transactions catégorisées avant le suivi restent sans provenance et sont
comptées à part, plutôt que d'être attribuées arbitrairement à un camp.

### Phase 6 — Repli flou local ☑
- ☑ `findFuzzyCategory()` — rapproche les clés marchand voisines de la mémoire
- ☑ Placé **avant** le dictionnaire : une décision de l'utilisateur, même approchée, prime sur la liste embarquée
- ☑ Refus de trancher entre candidats à égalité qui divergent
- ☑ Tests (9 cas) + parité mobile

**Écart assumé avec le plan initial** : pas de BM25. Il est fait pour des
documents longs ; une clé marchand fait un à trois mots, où un seuil sur un
score continu serait arbitraire et inexplicable. Le critère retenu — « au moins
deux mots en commun » — se raisonne directement et écarte le piège principal
(`BOULANGERIE MARTIN` vs `BOULANGERIE DUPONT` ne partagent que le métier).

### Phase 7 — Gains annexes ☑
- ☑ Détection des virements internes (montants opposés à ±3 j entre deux comptes de l'utilisateur), proposés à la confirmation comme les doublons
- ☑ Règles en mode « le libellé contient X » par défaut, regex reléguée en avancé
- ☑ Tests (8 cas) + parité mobile
- ~~Suggestion de règle après corrections répétées~~ — **abandonné** : la mémoire
  marchand (phase 1) traite déjà la répétition, et mieux. Proposer en plus une
  règle créerait deux sources de vérité pour un même marchand.

Les virements internes ne sont **pas** marqués d'office : un faux positif — une
dépense et un remboursement du même montant à quelques jours d'écart — sortirait
silencieusement une vraie dépense des statistiques.

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
git log --oneline -10    # une phase par commit
npm test                 # doit être vert avant de repartir
npm run build            # et le build aussi
```

Toutes les cases du plan initial sont cochées. Ce qui reste ouvert, si le sujet
est repris plus tard :

- **Enrichir le dictionnaire.** ~290 enseignes couvrent le gros du commerce
  français, pas la longue traîne (commerces locaux, enseignes régionales). Toute
  addition est une ligne dans `src/shared/merchantDictionary.ts` + un test.
- **Mesurer sur des données réelles.** Le taux d'automatisation est affiché mais
  n'a pas encore été observé sur un vrai historique : c'est lui qui dira si la
  cible > 95 % tient, et quelle couche fuit si elle ne tient pas.
- **Ambiguïté TOTALENERGIES.** Classé en carburant (paiements en station, les
  plus fréquents), alors qu'un prélèvement mensuel est de l'électricité. La
  mémoire corrige au premier ajustement, mais une entrée orientée débit/crédit
  ne suffirait pas à trancher — les deux sont des débits.
