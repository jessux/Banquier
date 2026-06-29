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
import Budget from './pages/Budget'

export type Page = 'dashboard' | 'transactions' | 'recurring' | 'patrimoine' | 'budget' | 'import' | 'chat' | 'categories' | 'rules' | 'settings'

interface SyncNotif {
  imported: number
  categorized: number
}

interface BudgetAlert {
  overCount: number
  overCategories: string[]
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [syncNotif, setSyncNotif] = useState<SyncNotif | null>(null)
  const [budgetAlert, setBudgetAlert] = useState<BudgetAlert | null>(null)

  useEffect(() => {
    window.api.powensStartupSync().then((result) => {
      if (result && result.imported > 0) {
        setSyncNotif({ imported: result.imported, categorized: result.categorized })
        const timer = setTimeout(() => setSyncNotif(null), 8000)
        return () => clearTimeout(timer)
      }
    }).catch(() => { /* sync silencieuse */ })

    // Alerte budgets dépassés ce mois-ci
    const today = new Date()
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const endDate = today.toISOString().slice(0, 10)
    window.api.getBudgetsWithSpent(startDate, endDate).then((budgets) => {
      const over = budgets.filter((b) => b.spent > b.amount)
      if (over.length > 0) {
        setBudgetAlert({ overCount: over.length, overCategories: over.slice(0, 3).map((b) => b.category) })
      }
    }).catch(() => {})
  }, [])

  const renderPage = (): JSX.Element => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={setPage} />
      case 'transactions': return <Transactions onImport={() => setPage('import')} />
      case 'recurring': return <Recurring />
      case 'patrimoine': return <Patrimoine />
      case 'budget': return <Budget />
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
      {budgetAlert && (
        <div className="sync-toast" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
          <div className="sync-toast-icon">🎯</div>
          <div className="sync-toast-body">
            <strong style={{ color: '#ef4444' }}>Budget{budgetAlert.overCount > 1 ? 's' : ''} dépassé{budgetAlert.overCount > 1 ? 's' : ''}</strong>
            <span>{budgetAlert.overCategories.join(', ')}{budgetAlert.overCount > 3 ? ` +${budgetAlert.overCount - 3} autre(s)` : ''}</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: 0, textAlign: 'left' }}
              onClick={() => { setPage('budget'); setBudgetAlert(null) }}
            >
              Voir les budgets →
            </button>
          </div>
          <button className="sync-toast-close" onClick={() => setBudgetAlert(null)}>✕</button>
        </div>
      )}
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
