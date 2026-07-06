# Changelog

## [1.24.0](https://github.com/jessux/Banquier/compare/v1.23.3...v1.24.0) (2026-07-06)


### Nouvelles fonctionnalités

* **dashboard:** display account balances and total in dashboard ([de61371](https://github.com/jessux/Banquier/commit/de613712b74ad81b214038dfa78beedaaeabf038))
* **database:** add balance column to accounts and update balance on import ([de61371](https://github.com/jessux/Banquier/commit/de613712b74ad81b214038dfa78beedaaeabf038))

## [1.23.3](https://github.com/jessux/Banquier/compare/v1.23.2...v1.23.3) (2026-07-05)


### Corrections de bugs

* **ci:** remove conflicting standalone vite dep and switch to Node 24 ([fe3b1c5](https://github.com/jessux/Banquier/commit/fe3b1c5ea7fdd03cdfd99dca5d5787de03164a38))
* **dependencies:** downgrade nat-upnp to 0.2.1 and update electron, electron-builder, and electron-vite versions ([465192e](https://github.com/jessux/Banquier/commit/465192ee7fde78b916f449549bc4bbff7048b97e))
* **packages:** Implement code changes to enhance functionality and improve performance ([684d722](https://github.com/jessux/Banquier/commit/684d72220376c0d48ba08a2d044ba93005b30bbb))

## [1.23.2](https://github.com/jessux/Banquier/compare/v1.23.1...v1.23.2) (2026-07-04)


### Corrections de bugs

* **dependencies:** update electron version to 31.7.7 ([e7a038b](https://github.com/jessux/Banquier/commit/e7a038b9eed0899abc44d73808e7f8590129f844))

## [1.23.1](https://github.com/jessux/Banquier/compare/v1.23.0...v1.23.1) (2026-07-04)


### Corrections de bugs

* **npmrc:** uncomment electron_get_use_proxy configuration ([6afa85b](https://github.com/jessux/Banquier/commit/6afa85b8a3b81b6d86bf60a2619fc2f6f191f421))

## [1.23.0](https://github.com/jessux/Banquier/compare/v1.22.0...v1.23.0) (2026-07-04)


### Nouvelles fonctionnalités

* **category:** add getCategoryMonthlyHistory function and integrate with IPC and UI ([9580590](https://github.com/jessux/Banquier/commit/95805905a9cf6502ca83264d03e8d406c9a5f9c4))

## [1.22.0](https://github.com/jessux/Banquier/compare/v1.21.0...v1.22.0) (2026-07-04)


### Nouvelles fonctionnalités

* **chat:** enhance error handling with retry option for rate limits ([0b88470](https://github.com/jessux/Banquier/commit/0b884709b4ae7975fea7b6916ee698e531548226))
* **chat:** improve retry logic for rate-limit errors in message display ([c1038fb](https://github.com/jessux/Banquier/commit/c1038fb09fbde334ac6155cbf9be604a78f6dd9c))
* **database:** enhance getMonthlyStats to support category exclusion ([6938c8d](https://github.com/jessux/Banquier/commit/6938c8d72ab2f4b6dec16aba2b81a2b15d29a2a1))
* implement AI memory retrieval and management ([145723a](https://github.com/jessux/Banquier/commit/145723a4536facc06922e752e22acf39c59c56f0))

## [1.21.0](https://github.com/jessux/Banquier/compare/v1.20.0...v1.21.0) (2026-07-04)


### Nouvelles fonctionnalités

* **budget:** add getCategoryMonthlyAverage API and integrate into Budget page ([d3f692a](https://github.com/jessux/Banquier/commit/d3f692a28c65613ad30e7a0b42c6225259ed9ac5))
* **patrimoine:** implement historical data filtering and variation calculation ([d3f692a](https://github.com/jessux/Banquier/commit/d3f692a28c65613ad30e7a0b42c6225259ed9ac5))


### Corrections de bugs

* **simulateur:** correct payment count reset logic and improve rendering ([d3f692a](https://github.com/jessux/Banquier/commit/d3f692a28c65613ad30e7a0b42c6225259ed9ac5))

## [1.20.0](https://github.com/jessux/Banquier/compare/v1.19.0...v1.20.0) (2026-07-02)


### Nouvelles fonctionnalités

* **patrimoine:** saisir quantité + ticker au lieu de la valeur pour actions/ETF/crypto ([787b4fc](https://github.com/jessux/Banquier/commit/787b4fc9f86833fe794700a5155e24884fb3a5a0))


### Corrections de bugs

* **powens:** la suppression d'un compte Powens ne tenait pas à la prochaine synchro ([787b4fc](https://github.com/jessux/Banquier/commit/787b4fc9f86833fe794700a5155e24884fb3a5a0))


### Documentation

* add Ko-fi support link to README ([702785f](https://github.com/jessux/Banquier/commit/702785f050794d5b6988030e38895b81b82d6f6b))

## [1.19.0](https://github.com/jessux/Banquier/compare/v1.18.0...v1.19.0) (2026-06-30)


### Nouvelles fonctionnalités

* **updater:** add backup functionality before auto-update installation ([a489786](https://github.com/jessux/Banquier/commit/a489786d882a2d547f4e0da33ff6ac95b88d670b))

## [1.18.0](https://github.com/jessux/Banquier/compare/v1.17.1...v1.18.0) (2026-06-30)


### Nouvelles fonctionnalités

* **profiles:** implement profile management with create, rename, switch, and delete functionalities ([0bcfd8e](https://github.com/jessux/Banquier/commit/0bcfd8e46152fbdcc859b38b200c2f7b0f81976c))

## [1.17.1](https://github.com/jessux/Banquier/compare/v1.17.0...v1.17.1) (2026-06-30)


### Corrections de bugs

* **proxy:** ensure NODE_TLS_REJECT_UNAUTHORIZED is set to '0' for self-signed certs ([d1eb57a](https://github.com/jessux/Banquier/commit/d1eb57aed7b88df04aea48e7b162921aadb71a7f))

## [1.17.0](https://github.com/jessux/Banquier/compare/v1.16.0...v1.17.0) (2026-06-30)


### Nouvelles fonctionnalités

* **index:** ensure proxy-aware behavior is enabled at runtime ([541aae3](https://github.com/jessux/Banquier/commit/541aae37fc31be563be8d88bcf43f2c94f647d95))
* **powens:** enable insecure TLS agent for self-signed certificates ([541aae3](https://github.com/jessux/Banquier/commit/541aae37fc31be563be8d88bcf43f2c94f647d95))
* **Simulateur:** add frequency of compounding option and update calculations ([541aae3](https://github.com/jessux/Banquier/commit/541aae37fc31be563be8d88bcf43f2c94f647d95))

## [1.16.0](https://github.com/jessux/Banquier/compare/v1.15.0...v1.16.0) (2026-06-30)


### Nouvelles fonctionnalités

* **build:** enable proxy settings for Windows build process ([c0ff495](https://github.com/jessux/Banquier/commit/c0ff4951cdd173282f4449029418ca9ff6aafd87))

## [1.15.0](https://github.com/jessux/Banquier/compare/v1.14.4...v1.15.0) (2026-06-30)


### Nouvelles fonctionnalités

* **settings:** add manual proxy configuration for corporate networks ([3642e70](https://github.com/jessux/Banquier/commit/3642e706b3726c736c375f578cdc8eff2c6eb9a3))

## [1.14.4](https://github.com/jessux/Banquier/compare/v1.14.3...v1.14.4) (2026-06-30)


### Corrections de bugs

* **build:** remove invalid createUninstaller nsis option ([44aec23](https://github.com/jessux/Banquier/commit/44aec23be201884fbf0e0a56bba19615ed9fa810))

## [1.14.3](https://github.com/jessux/Banquier/compare/v1.14.2...v1.14.3) (2026-06-30)


### Corrections de bugs

* **build:** enable nsis uninstaller and installation wizard for windows ([dd979d9](https://github.com/jessux/Banquier/commit/dd979d9523fe26950cec95df3051b477316f56b6))

## [1.14.2](https://github.com/jessux/Banquier/compare/v1.14.1...v1.14.2) (2026-06-30)


### Corrections de bugs

* **simulateur:** add interest column to amortization schedule table ([a42c7d0](https://github.com/jessux/Banquier/commit/a42c7d07a2e70ad7fed3cc52cf396230fbc78c84))

## [1.14.1](https://github.com/jessux/Banquier/compare/v1.14.0...v1.14.1) (2026-06-30)


### Corrections de bugs

* **powens:** improve error handling for SSL certificate issues in API requests ([26242f9](https://github.com/jessux/Banquier/commit/26242f9d334f16a3e54775ea46e0d31f99973d9c))

## [1.14.0](https://github.com/jessux/Banquier/compare/v1.13.0...v1.14.0) (2026-06-29)


### Nouvelles fonctionnalités

* **dashboard:** enhance category stats view with combined net balance and category filtering ([fd5884e](https://github.com/jessux/Banquier/commit/fd5884ed0968ccdcab13f342fb9889a6d820cff8))
* **simulateur:** add savings simulator page and integrate into navigation ([d5b8cc6](https://github.com/jessux/Banquier/commit/d5b8cc6ed32f252cf9bb892b5c4169a735c8b852))

## [1.13.0](https://github.com/jessux/Banquier/compare/v1.12.0...v1.13.0) (2026-06-29)


### Nouvelles fonctionnalités

* **onboarding:** add external link functionality and onboarding review option ([5abf34b](https://github.com/jessux/Banquier/commit/5abf34b223fc7386c07655bab0516787ae8a165d))
* **onboarding:** add onboarding modal and settings integration ([bacd757](https://github.com/jessux/Banquier/commit/bacd757601eb37e0c4b8cf1a2523c51ba470aac8))

## [1.12.0](https://github.com/jessux/Banquier/compare/v1.11.0...v1.12.0) (2026-06-29)


### Nouvelles fonctionnalités

* **budgets:** implement budget management features including CRUD operations and UI integration ([e8aee77](https://github.com/jessux/Banquier/commit/e8aee77fc9d7fac05d0ee373ea0cb5037726ba2a))
* **database:** add restore database functionality and IPC handler ([e9c4e50](https://github.com/jessux/Banquier/commit/e9c4e5046304e71674651b6f0aaab75a5e85c7f6))
* **transactions:** add note and tags functionality for transactions with alerts for budget overspending ([a9db8a5](https://github.com/jessux/Banquier/commit/a9db8a577b13f66c9f303b334251e7095760d76d))
* **transactions:** implement pagination and advanced filtering options ([f4ef4c2](https://github.com/jessux/Banquier/commit/f4ef4c2d70dd62e76e4bb463ad44efcaed6c2dde))

## [1.11.0](https://github.com/jessux/Banquier/compare/v1.10.1...v1.11.0) (2026-06-27)


### Nouvelles fonctionnalités

* **settings:** version, vérification MAJ, suppression et devise des comptes ([8289a57](https://github.com/jessux/Banquier/commit/8289a575e395d38d19c60be7c528e68c4a916373))


### Corrections de bugs

* **dashboard:** afficher dépenses et revenus par catégorie en même temps ([d10698e](https://github.com/jessux/Banquier/commit/d10698e0d9d39b90739676d995ef8abf2d41409b))

## [1.10.1](https://github.com/jessux/Banquier/compare/v1.10.0...v1.10.1) (2026-06-27)


### Corrections de bugs

* **csv:** parseDate robuste aux séparateurs point et tiret ([d26953e](https://github.com/jessux/Banquier/commit/d26953e42332a612ffaa32697d9745c6cb68b46a))

## [1.10.0](https://github.com/jessux/Banquier/compare/v1.9.3...v1.10.0) (2026-06-27)


### Nouvelles fonctionnalités

* **dashboard:** exclusion de catégorie inline + toggle dépenses/revenus ([2ba12ae](https://github.com/jessux/Banquier/commit/2ba12ae3d385f8b5f0d9ed78e759ebb3bb316a70))

## [1.9.3](https://github.com/jessux/Banquier/compare/v1.9.2...v1.9.3) (2026-06-27)


### Corrections de bugs

* **powens:** pagination relationnelle + limit 1000 + first_date dans la popup ([cb7f92c](https://github.com/jessux/Banquier/commit/cb7f92c0cc0845e8ae0518338905d9ac947cfee6))
* **powens:** startup sync incrémentale depuis la dernière transaction connue ([8de16c1](https://github.com/jessux/Banquier/commit/8de16c137ca1fd1555aea275527cafd8ddeff45c))

## [1.9.2](https://github.com/jessux/Banquier/compare/v1.9.1...v1.9.2) (2026-06-27)


### Corrections de bugs

* **powens:** filtre local par minDate manquant lors de la sync manuelle ([9c05353](https://github.com/jessux/Banquier/commit/9c05353cdcef841bdc272096e1391e1226448c42))

## [1.9.1](https://github.com/jessux/Banquier/compare/v1.9.0...v1.9.1) (2026-06-27)


### Corrections de bugs

* **settings:** fragment React manquant autour de la modal de sync ([e2fa37c](https://github.com/jessux/Banquier/commit/e2fa37c3be651a82095713a9e62b51e4ad27477a))

## [1.9.0](https://github.com/jessux/Banquier/compare/v1.8.0...v1.9.0) (2026-06-27)


### Nouvelles fonctionnalités

* **dashboard:** catégories de revenus et popup de dates pour la sync Powens ([7e88838](https://github.com/jessux/Banquier/commit/7e88838b44c2ea62394df8a4c1885ee739c7fed6))

## [1.8.0](https://github.com/jessux/Banquier/compare/v1.7.0...v1.8.0) (2026-06-27)


### Nouvelles fonctionnalités

* **settings:** vider toutes les transactions avec double confirmation ([#16](https://github.com/jessux/Banquier/issues/16)) ([a06432a](https://github.com/jessux/Banquier/commit/a06432ac70978468bf7e8d64f845bc36dca10de3))

## [1.7.0](https://github.com/jessux/Banquier/compare/v1.6.1...v1.7.0) (2026-06-27)


### Nouvelles fonctionnalités

* **powens:** historique 1 an à la première connexion bancaire ([#14](https://github.com/jessux/Banquier/issues/14)) ([e8a6430](https://github.com/jessux/Banquier/commit/e8a6430b668556a5b90309d8e1ede44fa2efe819))

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
