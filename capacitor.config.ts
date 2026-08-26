/// <reference types="@capacitor/background-runner" />
import type { CapacitorConfig } from '@capacitor/cli'

/** Identifiant du runner de fond. Il sert à la fois de nom de tâche WorkManager
 *  (Android), d'identifiant BGTaskScheduler (iOS — doit être répété tel quel dans
 *  `BGTaskSchedulerPermittedIdentifiers` de ios/App/App/Info.plist) et de nom du
 *  magasin clé/valeur `CapacitorKV` lu par le runner. Le changer casse les trois. */
const BACKGROUND_RUNNER_LABEL = 'com.banquier.app.background.sync'

const config: CapacitorConfig = {
  appId: 'com.banquier.app',
  appName: 'Banquier',
  webDir: 'out/renderer',
  // Routes fetch()/XMLHttpRequest through native networking instead of the WebView's,
  // so calls to openrouter.ai aren't blocked by browser-style CORS (needed for the
  // AI chat/categorization feature — see src/mobile/llm.ts).
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    // Surveillance Powens hors app (voir src/renderer/public/runners/background.js et
    // src/mobile/background-sync.ts). Le script tourne dans un moteur JS séparé du
    // webview, donc sans accès à SQLite : il détecte les nouvelles transactions et
    // notifie, l'import en base se fait à la réouverture de l'app.
    BackgroundRunner: {
      label: BACKGROUND_RUNNER_LABEL,
      // Chemin relatif au bundle web (webDir). Le fichier est copié tel quel depuis
      // src/renderer/public/ par Vite au build.
      src: 'runners/background.js',
      event: 'checkTransactions',
      repeat: true,
      // 60 min : les banques ne remontent leurs écritures que quelques fois par jour,
      // et Android impose de toute façon un minimum de 15 min entre deux exécutions.
      // L'intervalle réel reste à la main de l'OS (Doze, optimisations constructeur).
      interval: 60,
      // Enregistre la tâche périodique dès le lancement de l'app : le runner vérifie
      // ensuite lui-même l'interrupteur utilisateur (clé `enabled` dans CapacitorKV)
      // avant de faire le moindre appel réseau.
      autoStart: true
    }
  }
}

export default config
