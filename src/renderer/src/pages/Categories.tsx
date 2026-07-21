import { useEffect, useRef, useState } from 'react'
import type { Category } from '../../../shared/types'

interface AddRowProps {
  under: number | 'top'
  addingUnder: number | 'top' | null
  inputRef: React.RefObject<HTMLInputElement>
  newName: string
  setNewName: (v: string) => void
  setError: (v: string) => void
  error: string
  confirmAdd: () => void
  cancelAdd: () => void
}

function AddRow({ under, addingUnder, inputRef, newName, setNewName, setError, error, confirmAdd, cancelAdd }: AddRowProps) {
  if (addingUnder !== under) return null
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
      <input
        ref={inputRef}
        value={newName}
        onChange={(e) => { setNewName(e.target.value); setError('') }}
        placeholder="Nom de la catégorie"
        style={{ width: 220 }}
        onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') cancelAdd() }}
      />
      <button className="btn btn-primary" style={{ padding: '4px 12px' }} onClick={confirmAdd}>Ajouter</button>
      <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={cancelAdd}>✕</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </div>
  )
}

interface EditInlineProps {
  id: number
  currentName: string
  siblings: Category[]
  onDone: () => void
}

function EditInline({ id, currentName, siblings, onDone }: EditInlineProps) {
  const [value, setValue] = useState(currentName)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const confirm = async () => {
    const name = value.trim()
    if (!name) return
    if (name === currentName) { onDone(); return }
    if (siblings.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
      setError('Ce nom existe déjà.')
      return
    }
    await window.api.renameCategory(id, name)
    onDone()
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError('') }}
        style={{ width: 200 }}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onDone() }}
      />
      <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={confirm}>OK</button>
      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 12 }} onClick={onDone}>✕</button>
      {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
    </div>
  )
}

export default function Categories(): JSX.Element {
  const [tree, setTree] = useState<Category[]>([])
  const [addingUnder, setAddingUnder] = useState<number | 'top' | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => window.api.getCategoryTree().then(setTree)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (addingUnder !== null && inputRef.current) inputRef.current.focus()
  }, [addingUnder])

  const topLevel = tree.filter((c) => c.parent_id === null)
  const childrenOf = (id: number) => tree.filter((c) => c.parent_id === id)

  const startAdd = (under: number | 'top') => {
    setEditingId(null)
    setAddingUnder(under)
    setNewName('')
    setError('')
  }

  const cancelAdd = () => { setAddingUnder(null); setNewName(''); setError('') }

  const confirmAdd = async () => {
    const name = newName.trim()
    if (!name) return
    const parentId = addingUnder === 'top' ? undefined : (addingUnder as number)

    const siblings = parentId == null ? topLevel : childrenOf(parentId)
    if (siblings.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setError('Ce nom existe déjà à ce niveau.')
      return
    }

    await window.api.createCategory(name, parentId)
    cancelAdd()
    load()
  }

  const deleteCategory = async (id: number, name: string, hasChildren: boolean) => {
    const msg = hasChildren
      ? `Supprimer "${name}" et toutes ses sous-catégories ?`
      : `Supprimer "${name}" ?`
    if (!confirm(msg)) return
    await window.api.deleteCategory(id)
    load()
  }

  const finishEdit = () => { setEditingId(null); load() }

  const addRowProps = { addingUnder, inputRef, newName, setNewName, setError, error, confirmAdd, cancelAdd }

  const editBtn = (id: number) => (
    <button
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
      onClick={() => { setAddingUnder(null); setEditingId(id) }}
      title="Renommer"
    >
      ✎
    </button>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Catégories</h1>
        <button className="btn btn-primary" onClick={() => startAdd('top')}>
          + Nouvelle catégorie
        </button>
      </div>

      <div style={{ maxWidth: 640 }}>
        {addingUnder === 'top' && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
            <AddRow under="top" {...addRowProps} />
          </div>
        )}

        {topLevel.length === 0 && addingUnder !== 'top' && (
          <div className="empty-state">
            <p className="text-muted">Aucune catégorie. Créez-en une pour commencer.</p>
          </div>
        )}

        {topLevel.map((cat) => {
          const children = childrenOf(cat.id)
          return (
            <div key={cat.id} className="card" style={{ marginBottom: 10, padding: 0 }}>
              {/* Parent row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px',
                borderBottom: children.length > 0 || addingUnder === cat.id ? '1px solid var(--border)' : 'none'
              }}>
                {editingId === cat.id ? (
                  <EditInline id={cat.id} currentName={cat.name} siblings={topLevel} onDone={finishEdit} />
                ) : (
                  <span style={{ fontWeight: 600, flex: 1, fontSize: 14 }}>{cat.name}</span>
                )}
                {editingId !== cat.id && <>
                  {editBtn(cat.id)}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '3px 10px', fontSize: 12 }}
                    onClick={() => startAdd(cat.id)}
                    title="Ajouter une sous-catégorie"
                  >
                    + Sous-catégorie
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                    onClick={() => deleteCategory(cat.id, cat.name, children.length > 0)}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </>}
              </div>

              {/* Subcategories */}
              {children.map((sub, idx) => (
                <div
                  key={sub.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 16px 9px 32px',
                    borderBottom: idx < children.length - 1 || addingUnder === cat.id ? '1px solid #1e2130' : 'none',
                    background: '#171a24'
                  }}
                >
                  <span style={{ color: 'var(--text3)', marginRight: 4, fontSize: 12 }}>└─</span>
                  {editingId === sub.id ? (
                    <EditInline id={sub.id} currentName={sub.name} siblings={children} onDone={finishEdit} />
                  ) : (
                    <span style={{ flex: 1, fontSize: 13 }}>{sub.name}</span>
                  )}
                  {editingId !== sub.id && <>
                    {editBtn(sub.id)}
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
                      onClick={() => deleteCategory(sub.id, sub.name, false)}
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  </>}
                </div>
              ))}

              {/* Inline add subcategory form */}
              {addingUnder === cat.id && (
                <div style={{ padding: '10px 16px 10px 32px', background: '#171a24' }}>
                  <AddRow under={cat.id} {...addRowProps} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
