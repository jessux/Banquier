import { useEffect, useRef, useState } from 'react'
import type { Page } from '../App'
import type { Profile, ProfilesState } from '../../../shared/types'

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
  { id: 'comparaison', label: 'Comparer', icon: '⚖️' },
  { id: 'patrimoine', label: 'Patrimoine', icon: '💎' },
  { id: 'simulateur', label: 'Simulateur épargne', icon: '🎓' },
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
  const [state, setState] = useState<ProfilesState | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getProfiles().then(setState)
  }, [])

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const closeMenu = (): void => {
    setShowMenu(false)
    setCreating(false)
    setNewName('')
    setRenamingId(null)
    setRenameName('')
    setDeletingId(null)
  }

  const activeName = state?.profiles.find((p) => p.id === state.active)?.name ?? '…'

  const handleSwitch = async (id: string): Promise<void> => {
    if (id === state?.active) { closeMenu(); return }
    await window.api.switchProfile(id)
    closeMenu()
  }

  const handleCreate = async (): Promise<void> => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const next = await window.api.createProfile(trimmed)
    setState(next)
    setCreating(false)
    setNewName('')
    await window.api.switchProfile(next.profiles[next.profiles.length - 1].id)
  }

  const handleRename = async (id: string): Promise<void> => {
    const trimmed = renameName.trim()
    if (!trimmed) return
    const next = await window.api.renameProfile(id, trimmed)
    setState(next)
    setRenamingId(null)
    setRenameName('')
  }

  const handleDelete = async (id: string): Promise<void> => {
    const next = await window.api.deleteProfile(id)
    setState(next)
    setDeletingId(null)
    if (state?.active === id) {
      await window.api.switchProfile('default')
    }
  }

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

      {/* Profile switcher */}
      <div style={{ marginTop: 'auto', padding: '12px 12px 16px', position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setShowMenu((v) => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: showMenu ? 'var(--bg-hover)' : 'transparent',
            cursor: 'pointer', color: 'var(--text2)', fontSize: 13
          }}
        >
          <span style={{ fontSize: 15 }}>👤</span>
          <span style={{ flex: 1, textAlign: 'left', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeName}
          </span>
          <span style={{ fontSize: 10, opacity: 0.5 }}>▲</span>
        </button>

        {showMenu && state && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 12, right: 12,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 0', zIndex: 200,
            boxShadow: '0 -4px 20px rgba(0,0,0,0.3)'
          }}>
            <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Profils
            </div>

            {state.profiles.map((p: Profile) => (
              <div key={p.id}>
                {renamingId === p.id ? (
                  <div style={{ display: 'flex', gap: 4, padding: '4px 8px' }}>
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') { setRenamingId(null) } }}
                      style={{ flex: 1, fontSize: 12, padding: '4px 6px', borderRadius: 5 }}
                    />
                    <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleRename(p.id)}>OK</button>
                    <button className="btn btn-secondary" style={{ padding: '3px 6px', fontSize: 11 }} onClick={() => setRenamingId(null)}>✕</button>
                  </div>
                ) : deletingId === p.id ? (
                  <div style={{ padding: '6px 12px', fontSize: 12 }}>
                    <div style={{ color: 'var(--red)', marginBottom: 6 }}>Supprimer <strong>{p.name}</strong> ?</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }} onClick={() => handleDelete(p.id)}>Oui</button>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setDeletingId(null)}>Non</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 6px 12px', gap: 4 }}>
                    <button
                      onClick={() => handleSwitch(p.id)}
                      style={{
                        flex: 1, textAlign: 'left', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 13, color: p.id === state.active ? 'var(--primary)' : 'var(--text2)',
                        fontWeight: p.id === state.active ? 600 : 400, padding: 0
                      }}
                    >
                      {p.id === state.active && <span style={{ marginRight: 6 }}>✓</span>}
                      {p.name}
                    </button>
                    <button
                      title="Renommer"
                      onClick={() => { setRenamingId(p.id); setRenameName(p.name) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '2px 4px', borderRadius: 4 }}
                    >✏️</button>
                    {p.id !== 'default' && (
                      <button
                        title="Supprimer"
                        onClick={() => setDeletingId(p.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: '2px 4px', borderRadius: 4, opacity: 0.7 }}
                      >✕</button>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
              {creating ? (
                <div style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                    placeholder="Nom du profil"
                    style={{ flex: 1, fontSize: 12, padding: '4px 6px', borderRadius: 5 }}
                  />
                  <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleCreate} disabled={!newName.trim()}>OK</button>
                  <button className="btn btn-secondary" style={{ padding: '3px 6px', fontSize: 11 }} onClick={() => { setCreating(false); setNewName('') }}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none',
                    border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)'
                  }}
                >
                  + Nouveau profil
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
