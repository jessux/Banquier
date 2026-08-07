import type { CapacitorConfig } from '@capacitor/cli'

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
    }
  }
}

export default config
