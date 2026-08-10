# Limites connues

État réel du projet à date, pour éviter les surprises — voir aussi [`mobile.md`](mobile.md) pour le détail du portage Android/iOS.

- **Couverture de tests partielle** : vitest tourne en CI (parsers CSV, logique de récurrences/règles/comparaison/budgets dans `database.ts`, validation des réponses IA dans `llm.ts`), mais `ipc.ts`, `powens.ts`, `quotes.ts` et le renderer React n'ont pas encore de tests.
- **Taux de change manuel** : le taux de conversion des comptes multi-devises est saisi par l'utilisateur, sans rafraîchissement automatique (les cotations automatiques de `quotes.ts` n'alimentent que le module Patrimoine).
- **Build macOS non signé** : pas de compte développeur Apple, Gatekeeper bloque l'ouverture directe (contournement : clic droit → Ouvrir, ou `xattr -cr`).
- **Android** : phases Powens, Patrimoine, import PDF, récurrences/comparaison/simulateur non validées sur appareil physique (voir [`mobile.md`](mobile.md)).
- **iOS** : scaffolding seulement, jamais testé même en simulateur, pas de build installable sur iPhone.
- **Powens** : les identifiants d'API pointent vers un tenant sandbox partagé fourni avec l'application ; il n'y a pas de configuration Powens propre à l'utilisateur.
