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
import Comparaison from './pages/Comparaison'
import Previsionnel from './pages/Previsionnel'
import Goals from './pages/Goals'
import OnboardingModal from './components/OnboardingModal'
import { dismiss as dismissPowensJob, startStartupSync, usePowensJob } from './utils/powensJob'
import type { Settings as SettingsType } from '../../shared/types'

export type Page = 'dashboard' | 'transactions' | 'recurring' | 'patrimoine' | 'budget' | 'goals' | 'simulateur' | 'comparaison' | 'previsionnel' | 'import' | 'chat' | 'categories' | 'rules' | 'settings'

interface BudgetAlert {
  overCount: number
  overCategories: string[]
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [budgetAlert, setBudgetAlert] = useState<BudgetAlert | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loadedSettings, setLoadedSettings] = useState<SettingsType | null>(null)
  const [pendingUncategorizedFilter, setPendingUncategorizedFilter] = useState(false)

  // La synchronisation vit hors de React (src/renderer/src/utils/powensJob.ts) : elle
  // continue quand on change de page ou qu'on ferme l'onboarding, et son avancement
  // reste affichable partout.
  const job = usePowensJob()
  // Fermer le bandeau de progression ne doit pas interrompre la synchro en cours
  // (dismissPowensJob() refuse d'ailleurs tout reset tant qu'un job tourne) : on
  // masque donc juste son affichage, dans un état séparé qui se réarme dès qu'une
  // NOUVELLE synchro démarre — sinon elle resterait masquée pour toujours après
  // la première fermeture.
  const [hideProgressToast, setHideProgressToast] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setLoadedSettings(s)
      if (!s.onboardingDone) setShowOnboarding(true)
      document.documentElement.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'dark')
    })

    startStartupSync().catch((err) => {
      console.error('[powens-startup-sync]', err)
    })

    // Alerte budgets dépassés ce mois-ci
    const today = new Date()
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const endDate = today.toISOString().slice(0, 10)
    window.api.getBudgetsWithSpent(startDate, endDate).then((budgets) => {
      const over = budgets.filter((b) => b.spent > b.amount)
      if (over.length > 0) {
        const overCategories = over.slice(0, 3).map((b) => b.category)
        setBudgetAlert({ overCount: over.length, overCategories })
        // Doublée d'une notification système sur mobile : le toast ci-dessous
        // disparaît avec l'app, la notification reste dans la barre de statut.
        void window.api.notifications?.budgetAlert(overCategories, over.length)
      }
    }).catch(() => {})
  }, [])

  // Le toast de succès s'efface tout seul ; l'erreur reste jusqu'à ce que
  // l'utilisateur la ferme, pour qu'une banque à reconnecter ne passe pas inaperçue.
  useEffect(() => {
    if (job.phase !== 'done' || !job.result || job.result.warning) return
    const timer = setTimeout(dismissPowensJob, job.result.imported > 0 ? 8000 : 3000)
    return () => clearTimeout(timer)
  }, [job.phase, job.result])

  const navigate = (p: Page, opts?: { uncategorized?: boolean }): void => {
    setPendingUncategorizedFilter(!!opts?.uncategorized)
    setPage(p)
  }

  const renderPage = (): JSX.Element => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />
      case 'transactions': return <Transactions onImport={() => navigate('import')} initialUncategorized={pendingUncategorizedFilter} />
      case 'recurring': return <Recurring />
      case 'patrimoine': return <Patrimoine />
      case 'budget': return <Budget />
      case 'goals': return <Goals />
      case 'simulateur': return <Simulateur />
      case 'comparaison': return <Comparaison />
      case 'previsionnel': return <Previsionnel />
      case 'import': return <Import />
      case 'chat': return <Chat />
      case 'categories': return <Categories />
      case 'rules': return <Rules />
      case 'settings': return <Settings />
    }
  }

  const syncResult = job.phase === 'done' ? job.result : null
  const syncError = job.phase === 'error' ? job.error : null
  const syncRunning = job.phase === 'webview' || job.phase === 'waiting' || job.phase === 'importing'
  const uncategorized = syncResult ? syncResult.imported - syncResult.categorized : 0

  useEffect(() => {
    if (syncRunning) setHideProgressToast(false)
  }, [syncRunning])

  const handleOnboardingDone = async (saved: Partial<SettingsType>): Promise<void> => {
    await window.api.saveSettings(saved)
    setShowOnboarding(false)
  }

  return (
    <div className="layout">
      <Sidebar activePage={page} onNavigate={navigate} />
      <main className="main-content">{renderPage()}</main>
      {showOnboarding && loadedSettings && (
        <OnboardingModal
          settings={loadedSettings}
          onDone={handleOnboardingDone}
          onNavigate={(p) => { setPage(p as Page); setShowOnboarding(false) }}
        />
      )}
      <div className="sync-toast-stack">
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
      {syncRunning && job.message && !hideProgressToast && (
        <div className="sync-toast">
          <div className="sync-toast-icon"><span className="spinner" /></div>
          <div className="sync-toast-body">
            <strong>Synchronisation Powens</strong>
            <span>{job.message}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Vous pouvez continuer à utiliser l’application.
            </span>
          </div>
          <button className="sync-toast-close" onClick={() => setHideProgressToast(true)}>✕</button>
        </div>
      )}
      {syncError && (
        <div className="sync-toast" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
          <div className="sync-toast-icon">🏦</div>
          <div className="sync-toast-body">
            <strong style={{ color: '#ef4444' }}>Synchronisation Powens échouée</strong>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{syncError.slice(0, 120)}</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: 0, textAlign: 'left' }}
              onClick={() => { setPage('settings'); dismissPowensJob() }}
            >
              Reconnecter dans les paramètres →
            </button>
          </div>
          <button className="sync-toast-close" onClick={dismissPowensJob}>✕</button>
        </div>
      )}
      {syncResult && (
        <div
          className="sync-toast"
          style={syncResult.warning ? { borderColor: 'rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.08)' } : undefined}
        >
          <div className="sync-toast-icon">🏦</div>
          <div className="sync-toast-body">
            <strong>Synchronisation Powens</strong>
            {syncResult.imported > 0 ? (
              <>
                <span>
                  {syncResult.imported} nouvelle{syncResult.imported > 1 ? 's' : ''} transaction{syncResult.imported > 1 ? 's' : ''}
                </span>
                <span>
                  {syncResult.categorized} catégorisée{syncResult.categorized !== 1 ? 's' : ''} auto
                  {uncategorized > 0 && <> · <em>{uncategorized} à classer</em></>}
                </span>
              </>
            ) : (
              <span>Aucune nouvelle transaction</span>
            )}
            {syncResult.warning && (
              <>
                <span style={{ fontSize: 11, color: '#eab308' }}>{syncResult.warning}</span>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#eab308', padding: 0, textAlign: 'left' }}
                  onClick={() => { setPage('settings'); dismissPowensJob() }}
                >
                  Vérifier ma banque dans les paramètres →
                </button>
              </>
            )}
          </div>
          <button className="sync-toast-close" onClick={dismissPowensJob}>✕</button>
        </div>
      )}
      </div>
    </div>
  )
}
