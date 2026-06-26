import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Import from './pages/Import'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import Categories from './pages/Categories'
import Rules from './pages/Rules'
import Recurring from './pages/Recurring'
import Patrimoine from './pages/Patrimoine'

export type Page = 'dashboard' | 'transactions' | 'recurring' | 'patrimoine' | 'import' | 'chat' | 'categories' | 'rules' | 'settings'

interface SyncNotif {
  imported: number
  categorized: number
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [syncNotif, setSyncNotif] = useState<SyncNotif | null>(null)

  useEffect(() => {
    window.api.powensStartupSync().then((result) => {
      if (result && result.imported > 0) {
        setSyncNotif({ imported: result.imported, categorized: result.categorized })
        const timer = setTimeout(() => setSyncNotif(null), 8000)
        return () => clearTimeout(timer)
      }
    }).catch(() => { /* sync silencieuse */ })
  }, [])

  const renderPage = (): JSX.Element => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'transactions': return <Transactions onImport={() => setPage('import')} />
      case 'recurring': return <Recurring />
      case 'patrimoine': return <Patrimoine />
      case 'import': return <Import />
      case 'chat': return <Chat />
      case 'categories': return <Categories />
      case 'rules': return <Rules />
      case 'settings': return <Settings />
    }
  }

  const uncategorized = syncNotif ? syncNotif.imported - syncNotif.categorized : 0

  return (
    <div className="layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="main-content">{renderPage()}</main>
      {syncNotif && (
        <div className="sync-toast">
          <div className="sync-toast-icon">🏦</div>
          <div className="sync-toast-body">
            <strong>Synchronisation Powens</strong>
            <span>
              {syncNotif.imported} nouvelle{syncNotif.imported > 1 ? 's' : ''} transaction{syncNotif.imported > 1 ? 's' : ''}
            </span>
            <span>
              {syncNotif.categorized} catégorisée{syncNotif.categorized !== 1 ? 's' : ''} auto
              {uncategorized > 0 && <> · <em>{uncategorized} à classer</em></>}
            </span>
          </div>
          <button className="sync-toast-close" onClick={() => setSyncNotif(null)}>✕</button>
        </div>
      )}
    </div>
  )
}
