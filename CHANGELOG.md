# Changelog

## [1.6.1](https://github.com/jessux/Banquier/compare/v1.6.0...v1.6.1) (2026-06-26)


### Corrections de bugs

* permet de filtrer les transactions par compte bancaire ([3bedb42](https://github.com/jessux/Banquier/commit/3bedb4275aa09c375bc917f6e19933120eedcba9))

## [1.6.0](https://github.com/jessux/Banquier/compare/v1.5.0...v1.6.0) (2026-06-26)


### Nouvelles fonctionnalités

* **database:** améliore le filtrage des transactions par catégorie pour inclure les sous-catégories ([5e74878](https://github.com/jessux/Banquier/commit/5e74878d978b5a7fc41598a86bc598e46a3aacfe))


### Corrections de bugs

* supprime le doublon de categorie Remboursement (singulier) ([c693891](https://github.com/jessux/Banquier/commit/c693891a33c2087e06b653b3835a1cc0f4beb1c4))

## [1.5.0](https://github.com/jessux/Banquier/compare/v1.4.0...v1.5.0) (2026-06-26)


### Nouvelles fonctionnalités

* ajoute l'agrégation bancaire via Powens ([25c6f87](https://github.com/jessux/Banquier/commit/25c6f873e0a8f557e5c2f60564dd582a3db93032))
* ajoute l'open banking gratuit via GoCardless Bank Account Data ([4b5f750](https://github.com/jessux/Banquier/commit/4b5f7500d98a5ddf8353aede0b1430e5c4f71496))
* ajoute le module Patrimoine (immobilier, actions, ETF, crypto…) ([0802c4b](https://github.com/jessux/Banquier/commit/0802c4bac218ff408249c857b4ab541f3d0481b5))
* ajoute une intégration Woob (open banking gratuit et 100% local) ([2ffa0bc](https://github.com/jessux/Banquier/commit/2ffa0bcc8b499cb964a1031ae55031eaa62614c4))
* **patrimoine:** cotation automatique et investissement programmé (DCA) ([cda5ec7](https://github.com/jessux/Banquier/commit/cda5ec722f049c174aa6d5f0fcb0232dc56936e8))
* **patrimoine:** lots d'achat et plus/moins-value pour actions/ETF/crypto ([79b2441](https://github.com/jessux/Banquier/commit/79b244170186f9949b7343bca3fd1bcd11720bdb))
* **powens:** flux via /auth/init + code temporaire, et attente de synchro ([58989cd](https://github.com/jessux/Banquier/commit/58989cdb8883199b3992b756c49b8faac58e8556))
* renommage de comptes, correction des règles sur comptes Powens et sync au démarrage ([f3c4696](https://github.com/jessux/Banquier/commit/f3c46964f7c4a7cbcc20af3f04c499e3193e0103))
* **woob:** capture une trace HTTP de debug en cas d'échec de connexion ([913735b](https://github.com/jessux/Banquier/commit/913735be9b542118fff09a18c4be9646cf49cffb))


### Corrections de bugs

* affiche un menu déroulant pour les champs Woob à choix (ex: Caisse Régionale du Crédit Agricole) ([1c9a8dc](https://github.com/jessux/Banquier/commit/1c9a8dc7338fcbf05c091e9e1cde95b88de1bd65))


### Documentation

* met à jour le README avec des liens vers les dernières versions et des instructions de téléchargement ([da2c30f](https://github.com/jessux/Banquier/commit/da2c30f6c04ec2fe15d43b51e1e4027dc93ee995))

## [1.4.0](https://github.com/jessux/Banquier/compare/banquier-v1.3.1...banquier-v1.4.0) (2026-06-24)


### Nouvelles fonctionnalités

* ajoute la mise à jour automatique via GitHub Releases ([#8](https://github.com/jessux/Banquier/issues/8)) ([45da915](https://github.com/jessux/Banquier/commit/45da9157c33ff16af29527335346f8be7d448d20))

## [1.3.1](https://github.com/jessux/Banquier/compare/banquier-v1.3.0...banquier-v1.3.1) (2026-06-24)


### Corrections de bugs

* le filtre « Tout » du dashboard couvre tout l'historique ([b8ad6ac](https://github.com/jessux/Banquier/commit/b8ad6ac300c25e8af737e68bea344ea81546a3b0))
* met à jour le modèle OpenRouter par défaut vers openrouter/free ([588c6ab](https://github.com/jessux/Banquier/commit/588c6abaadad5d734a4f02c4db9e78f2d0ea70b3))

## [1.3.0](https://github.com/jessux/Banquier/compare/banquier-v1.2.0...banquier-v1.3.0) (2026-06-24)


### Nouvelles fonctionnalités

* onglet Récurrences et outils d'analyse IA ([611d489](https://github.com/jessux/Banquier/commit/611d489105e6236455b5daed0296e377ada382bd))

## [1.2.0](https://github.com/jessux/Banquier/compare/banquier-v1.1.0...banquier-v1.2.0) (2026-06-23)


### Nouvelles fonctionnalités

* recherche et filtre par catégorie dans les règles automatiques ([6d12283](https://github.com/jessux/Banquier/commit/6d122834fc5cd1c0b50c8d9fd81e523c2d8b3b44))
* tendance du dashboard calée sur la période filtrée ([04ec80f](https://github.com/jessux/Banquier/commit/04ec80f6f167ac6f8be9b2baf93e3a1d2252fc03))


### Corrections de bugs

* détection robuste du délimiteur et de l'en-tête des CSV bancaires ([49c1d2a](https://github.com/jessux/Banquier/commit/49c1d2ae6e1e86bebb060eabfc957c2806debade))

## [1.1.0](https://github.com/jessux/Banquier/compare/banquier-v1.0.0...banquier-v1.1.0) (2026-06-22)


### Nouvelles fonctionnalités

* automated releases + mobile phone dashboard access ([628ea16](https://github.com/jessux/Banquier/commit/628ea16bf923ebe37267c5a7abc2af626ba51b0b))
* automated releases + mobile phone dashboard access ([62bfed2](https://github.com/jessux/Banquier/commit/62bfed2578e8c7b7f763aecccf734dabebd10169))
* UPnP automatic port forwarding for 4G mobile server access ([eb1216e](https://github.com/jessux/Banquier/commit/eb1216ecff5d0e5d0fc9e27071f27e2a98b8c8c3))
* UPnP automatic port forwarding for 4G mobile server access ([c9e0d41](https://github.com/jessux/Banquier/commit/c9e0d414d109bf764f47d408cc576e7860c3b7b5))


### Corrections de bugs

* commit package-lock.json and fix CI workflow ([5cbb1f9](https://github.com/jessux/Banquier/commit/5cbb1f9667108d588c82ba8516d19dd352e9daab))


### Documentation

* add SQLite export/restore section to README ([63eeb81](https://github.com/jessux/Banquier/commit/63eeb817dedc143e44dc9becf8048fe487ab96a7))
