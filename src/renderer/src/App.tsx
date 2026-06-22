import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Import from './pages/Import'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import Categories from './pages/Categories'
import Rules from './pages/Rules'

export type Page = 'dashboard' | 'transactions' | 'import' | 'chat' | 'categories' | 'rules' | 'settings'

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = (): JSX.Element => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'transactions': return <Transactions onImport={() => setPage('import')} />
      case 'import': return <Import />
      case 'chat': return <Chat />
      case 'categories': return <Categories />
      case 'rules': return <Rules />
      case 'settings': return <Settings />
    }
  }

  return (
    <div className="layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="main-content">{renderPage()}</main>
    </div>
  )
}
