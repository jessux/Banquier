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
import Simulateur from './pages/Simulateur'
import OnboardingModal from './components/OnboardingModal'
import type { Settings as SettingsType } from '../../../shared/types'

export type Page = 'dashboard' | 'transactions' | 'recurring' | 'patrimoine' | 'budget' | 'simulateur' | 'import' | 'chat' | 'categories' | 'rules' | 'settings'

interface SyncNotif {
  imported: number
  categorized: number
  error?: string
}

interface BudgetAlert {
  overCount: number
  overCategories: string[]
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [syncNotif, setSyncNotif] = useState<SyncNotif | null>(null)
  const [budgetAlert, setBudgetAlert] = useState<BudgetAlert | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loadedSettings, setLoadedSettings] = useState<SettingsType | null>(null)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setLoadedSettings(s)
      if (!s.onboardingDone) setShowOnboarding(true)
    })

    window.api.powensStartupSync().then((result) => {
      if (!result) return
      if (result.error) {
        setSyncNotif({ imported: -1, categorized: 0, error: result.error })
        return
      }
      if (result.imported > 0) {
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
      case 'simulateur': return <Simulateur />
      case 'import': return <Import />
      case 'chat': return <Chat />
      case 'categories': return <Categories />
      case 'rules': return <Rules />
      case 'settings': return <Settings />
    }
  }

  const uncategorized = syncNotif ? syncNotif.imported - syncNotif.categorized : 0

  const handleOnboardingDone = async (saved: Partial<SettingsType>): Promise<void> => {
    await window.api.saveSettings(saved)
    setShowOnboarding(false)
  }

  return (
    <div className="layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="main-content">{renderPage()}</main>
      {showOnboarding && loadedSettings && (
        <OnboardingModal
          settings={loadedSettings}
          onDone={handleOnboardingDone}
          onNavigate={(p) => { setPage(p as Page); setShowOnboarding(false) }}
        />
      )}
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
      {syncNotif && syncNotif.error && (
        <div className="sync-toast" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
          <div className="sync-toast-icon">🏦</div>
          <div className="sync-toast-body">
            <strong style={{ color: '#ef4444' }}>Synchronisation Powens échouée</strong>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{syncNotif.error.slice(0, 120)}</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: 0, textAlign: 'left' }}
              onClick={() => { setPage('settings'); setSyncNotif(null) }}
            >
              Reconnecter dans les paramètres →
            </button>
          </div>
          <button className="sync-toast-close" onClick={() => setSyncNotif(null)}>✕</button>
        </div>
      )}
      {syncNotif && !syncNotif.error && (
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
