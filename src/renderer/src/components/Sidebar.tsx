import type { Page } from '../App'

interface NavItem {
  id: Page
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
  { id: 'transactions', label: 'Transactions', icon: '📋' },
  { id: 'recurring', label: 'Récurrences', icon: '🔁' },
  { id: 'budget', label: 'Budgets', icon: '🎯' },
  { id: 'patrimoine', label: 'Patrimoine', icon: '💎' },
  { id: 'categories', label: 'Catégories', icon: '🏷️' },
  { id: 'rules', label: 'Règles auto', icon: '⚡' },
  { id: 'chat', label: 'Analyser avec IA', icon: '🤖' },
  { id: 'settings', label: 'Paramètres', icon: '⚙️' }
]

interface Props {
  activePage: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ activePage, onNavigate }: Props): JSX.Element {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span>B</span>anquier
      </div>
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
