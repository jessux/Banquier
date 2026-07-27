import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

async function bootstrap(): Promise<void> {
  // Under Electron, window.api is already injected by the preload script.
  // Under Capacitor (Android), install the native window.api polyfill first.
  if (!window.api) {
    const { installMobileApi } = await import('../../mobile/entry')
    await installMobileApi()
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

bootstrap()
