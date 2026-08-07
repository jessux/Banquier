import { useEffect, useRef, useState } from 'react'
import type { Transaction, Account, CategorizationProposal } from '../../../shared/types'
import CategoryPicker from '../components/CategoryPicker'
import { categoryBadgeStyle } from '../utils/categoryColor'

const PAGE_SIZE = 75

function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

const COMMON_CATEGORIES = [
  'Alimentation', 'Logement', 'Transport', 'Restaurants', 'Loisirs',
  'Santé', 'Shopping', 'Abonnements', 'Épargne', 'Salaire', 'Autre'
]

function autoPattern(description: string): string {
  return description
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/\d+/g, '\\d+')
}

interface EditingCell {
  id: number
  currentCategory: string | null
}

interface RegexPanel {
  category: string
  pattern: string
  matchCount: number | null
  checking: boolean
}

interface DuplicateGroup {
  transactions: Transaction[]
}

export default function Transactions({ onImport, initialUncategorized }: { onImport?: () => void; initialUncategorized?: boolean }): JSX.Element {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  // Filters
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(initialUncategorized ? '__none__' : '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [tagsFilter, setTagsFilter] = useState('')
  const [internalFilter, setInternalFilter] = useState<'all' | 'external' | 'internal'>('all')
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Sort (DB-side)
  const [sortField, setSortField] = useState<'date' | 'amount' | 'description' | 'category'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // Data
  const [categories, setCategories] = useState<string[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [monthOffset, setMonthOffset] = useState<number | null>(null)
  // Edit states
  const [categorizing, setCategorizing] = useState(false)
  const [catProgress, setCatProgress] = useState<{ done: number; total: number } | null>(null)
  const [proposals, setProposals] = useState<(CategorizationProposal & { accepted: boolean })[] | null>(null)
  const [applyingProposals, setApplyingProposals] = useState(false)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [regexPanel, setRegexPanel] = useState<RegexPanel | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [editingNote, setEditingNote] = useState<{ id: number; note: string; tags: string } | null>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const patternRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const buildFilters = (currentPage = page) => ({
    search: search || undefined,
    category: category || undefined,
    accountId: accountId ?? undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    minAmount: minAmount !== '' ? parseFloat(minAmount) : undefined,
    maxAmount: maxAmount !== '' ? parseFloat(maxAmount) : undefined,
    tags: tagsFilter || undefined,
    isInternal: internalFilter === 'all' ? undefined : internalFilter === 'internal',
    sortField,
    sortDir,
    limit: PAGE_SIZE,
    offset: currentPage * PAGE_SIZE,
  })

  const load = (currentPage = page): void => {
    setLoading(true)
    const filters = buildFilters(currentPage)
    const countFilters = { ...filters, limit: undefined, offset: undefined }
    Promise.all([
      window.api.getTransactions(filters),
      window.api.countTransactions(countFilters),
    ]).then(([txs, count]) => {
      setTransactions(txs)
      setTotalCount(count)
      setLoading(false)
    })
  }

  const resetAndLoad = (): void => {
    setPage(0)
    load(0)
  }

  useEffect(() => {
    Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
      setCategories([...new Set([...paths, ...existing])].sort())
    })
    window.api.getAccounts().then(setAccounts)
  }, [])

  // Raccourci clavier "/" : focus la recherche, sauf si un champ est déjà en cours d'édition.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== '/') return
      const target = e.target as HTMLElement
      const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      if (isEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Reload when filters or sort change — reset to page 0
  useEffect(() => { resetAndLoad() }, [search, category, accountId, startDate, endDate, minAmount, maxAmount, tagsFilter, internalFilter, sortField, sortDir])

  // Reload when page changes (without resetting)
  useEffect(() => { load(page) }, [page])

  useEffect(() => {
    if (!editing) return
    const id = setTimeout(() => editRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [editing])

  useEffect(() => {
    if (!regexPanel) return
    const id = setTimeout(() => patternRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [regexPanel !== null])

  useEffect(() => {
    if (!regexPanel) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setRegexPanel((p) => p ? { ...p, checking: true, matchCount: null } : null)
    debounceRef.current = setTimeout(async () => {
      try {
        const count = await window.api.countPattern(regexPanel.pattern)
        setRegexPanel((p) => p ? { ...p, matchCount: count, checking: false } : null)
      } catch {
        setRegexPanel((p) => p ? { ...p, matchCount: null, checking: false } : null)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [regexPanel?.pattern])

  const startEdit = (tx: Transaction): void => {
    setRegexPanel(null)
    setEditing({ id: tx.id, currentCategory: tx.category })
    setNewCategory(tx.category || '')
  }

  const commitEdit = (id: number, cat: string): void => {
    setEditing(null)
    const isIntern = cat.toLowerCase().includes('intern')
    setTransactions((prev) => prev.map((tx) =>
      tx.id === id ? { ...tx, category: cat, is_internal: isIntern ? 1 : tx.is_internal } : tx
    ))
    window.api.updateTransactionCategory(id, cat)
      .then(() => isIntern ? window.api.setTransactionInternal(id, true) : Promise.resolve())
      .then(() => {
        load()
        Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
          setCategories([...new Set([...paths, ...existing])].sort())
        })
      })
  }

  const openRegexPanel = (tx: Transaction): void => {
    setEditing(null)
    setRegexPanel({
      category: newCategory || tx.category || '',
      pattern: autoPattern(tx.description),
      matchCount: null,
      checking: true
    })
  }

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const applyRegex = (): void => {
    if (!regexPanel) return
    const { category: cat, pattern } = regexPanel
    setRegexPanel(null)
    window.api.applyCategoryPattern(cat, pattern).then((updated) => {
      load()
      Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
        setCategories([...new Set([...paths, ...existing])].sort())
      })
      showToast(`${updated} transaction(s) catégorisée(s) en "${cat}"`)
    })
  }

  const runAiCategorization = async (onlyUncategorized: boolean): Promise<void> => {
    setCategorizing(true)
    setCatProgress({ done: 0, total: 0 })
    try {
      const result = await window.api.categorizeAi(onlyUncategorized, (done, total) => {
        setCatProgress({ done, total })
      })
      load()
      Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
        setCategories([...new Set([...paths, ...existing])].sort())
      })
      if (result.proposals.length === 0) {
        alert('Aucune nouvelle suggestion de catégorie (règles déjà appliquées).')
      } else {
        setProposals(result.proposals.map((p) => ({ ...p, accepted: true })))
      }
    } catch (e) {
      alert(`Erreur : ${String(e)}`)
    } finally {
      setCategorizing(false)
      setCatProgress(null)
    }
  }

  const applyProposals = async (): Promise<void> => {
    if (!proposals) return
    const updates = proposals.filter((p) => p.accepted).map(({ id, category }) => ({ id, category }))
    setApplyingProposals(true)
    try {
      await window.api.applyCategorization(updates)
      setProposals(null)
      load()
      showToast(`${updates.length} transaction(s) catégorisée(s)`)
    } finally {
      setApplyingProposals(false)
    }
  }

  const checkDuplicates = async (): Promise<void> => {
    setCheckingDuplicates(true)
    const groups = await window.api.findDuplicates()
    setDuplicates(groups.map((txs) => ({ transactions: txs })))
    setCheckingDuplicates(false)
  }

  const deleteDuplicate = async (id: number, groupIdx: number): Promise<void> => {
    await window.api.deleteTransaction(id)
    setDuplicates((prev) => {
      if (!prev) return prev
      return prev.map((g, i) =>
        i !== groupIdx ? g : { transactions: g.transactions.filter((t) => t.id !== id) }
      ).filter((g) => g.transactions.length > 1)
    })
    load()
    showToast('Transaction supprimée')
  }

  const saveNote = async (): Promise<void> => {
    if (!editingNote) return
    await window.api.setTransactionNote(editingNote.id, editingNote.note || null)
    await window.api.setTransactionTags(editingNote.id, editingNote.tags || null)
    setEditingNote(null)
    load()
  }

  const toggleSort = (field: typeof sortField): void => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const applyMonth = (offset: number): void => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth() + offset
    const first = new Date(y, m, 1)
    const last = new Date(y, m + 1, 0)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    setStartDate(fmt(first))
    setEndDate(fmt(offset === 0 ? now : last))
    setMonthOffset(offset)
  }

  const clearMonth = (): void => { setStartDate(''); setEndDate(''); setMonthOffset(null) }

  const monthLabel = (offset: number): string => {
    const NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
    const d = new Date(); d.setMonth(d.getMonth() + offset)
    return `${NAMES[d.getMonth()]} ${d.getFullYear()}`
  }

  const hasAdvancedFilter = minAmount !== '' || maxAmount !== '' || tagsFilter !== ''
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasFilters = search || category || accountId !== null || startDate || endDate || internalFilter !== 'all' || hasAdvancedFilter

  const SortHeader = ({ field, label, align }: { field: typeof sortField; label: string; align?: string }) => (
    <th
      onClick={() => toggleSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align as 'right' | undefined, whiteSpace: 'nowrap' }}
    >
      {label}{' '}
      <span style={{ color: sortField === field ? 'var(--accent)' : 'var(--border)', fontSize: 10 }}>
        {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onImport}>📥 Importer</button>
          {catProgress && catProgress.total > 0 && (
            <span className="text-muted text-sm">
              <span className="spinner" style={{ marginRight: 6 }} />
              {catProgress.done}/{catProgress.total}
            </span>
          )}
          <button className="btn btn-secondary" onClick={() => runAiCategorization(true)} disabled={categorizing} title="Propose une catégorie (via recherche web) pour les transactions sans catégorie, à valider ensuite">
            {categorizing ? <span className="spinner" /> : '🤖'} Catégoriser non catégorisées
          </button>
          <button className="btn btn-secondary" onClick={() => runAiCategorization(false)} disabled={categorizing}>
            ↺ Tout recatégoriser
          </button>
          <button className="btn btn-secondary" onClick={checkDuplicates} disabled={checkingDuplicates}>
            {checkingDuplicates ? <span className="spinner" /> : '🔍'} Vérifier doublons
          </button>
          <span className="text-muted">{totalCount} résultat{totalCount > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input ref={searchRef} placeholder="Rechercher... (/)" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 200 }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes les catégories</option>
          <option value="__none__">— Sans catégorie</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {accounts.length > 0 && (
          <select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tous les comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {/* Navigateur de mois */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg2)', borderRadius: 20, padding: '3px 6px', border: monthOffset !== null ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
          <button onClick={() => applyMonth((monthOffset ?? 0) - 1)} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span onClick={() => monthOffset === null ? applyMonth(0) : clearMonth()} style={{ fontSize: 13, color: monthOffset !== null ? 'var(--text)' : 'var(--text3)', minWidth: 110, textAlign: 'center', cursor: 'pointer', fontWeight: monthOffset !== null ? 500 : 400, userSelect: 'none' }}>
            {monthOffset !== null ? monthLabel(monthOffset) : 'Mois…'}
          </span>
          <button onClick={() => applyMonth((monthOffset ?? 0) + 1)} disabled={monthOffset !== null && monthOffset >= 0} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: monthOffset !== null && monthOffset >= 0 ? 'default' : 'pointer', background: 'transparent', color: monthOffset !== null && monthOffset >= 0 ? '#3e4259' : 'var(--text2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setMonthOffset(null) }} style={{ width: 140 }} />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setMonthOffset(null) }} style={{ width: 140 }} />
        <select value={internalFilter} onChange={(e) => setInternalFilter(e.target.value as 'all' | 'external' | 'internal')} style={{ width: 160 }}>
          <option value="all">Toutes</option>
          <option value="external">Hors internes</option>
          <option value="internal">Internes uniquement</option>
        </select>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, borderColor: hasAdvancedFilter ? 'var(--accent)' : undefined, color: hasAdvancedFilter ? 'var(--accent-light)' : undefined }}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? '▲' : '▼'} Filtres avancés{hasAdvancedFilter ? ' •' : ''}
        </button>
        {hasFilters && (
          <button className="btn btn-secondary" onClick={() => {
            setSearch(''); setCategory(''); setAccountId(null); setStartDate(''); setEndDate('')
            setInternalFilter('all'); setMonthOffset(null); setMinAmount(''); setMaxAmount(''); setTagsFilter('')
          }}>
            Effacer filtres
          </button>
        )}
        {category && (
          <button className="btn btn-secondary" style={{ fontSize: 12, color: 'var(--accent)', borderColor: 'var(--accent)' }}
            onClick={async () => {
              const allInternal = transactions.every((t) => t.is_internal === 1)
              await window.api.setInternalByCategory(category, !allInternal)
              load()
            }}
          >
            ⇄ {transactions.every((t) => t.is_internal === 1) ? 'Marquer externes' : 'Marquer internes'}
          </button>
        )}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 0', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Montant :</span>
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Min"
            style={{ width: 90 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>→</span>
          <input
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            placeholder="Max"
            style={{ width: 90 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 12 }}>Tag :</span>
          <input
            value={tagsFilter}
            onChange={(e) => setTagsFilter(e.target.value)}
            placeholder="remboursement…"
            style={{ width: 160 }}
          />
        </div>
      )}

      {/* AI categorization proposals — pending user validation */}
      {proposals !== null && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-light)' }}>
              🌐 {proposals.length} suggestion(s) de catégorie (recherche web) — {proposals.filter((p) => p.accepted).length} sélectionnée(s)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setProposals((prev) => prev?.map((p) => ({ ...p, accepted: true })) ?? null)}>Tout cocher</button>
              <button className="btn btn-secondary" onClick={() => setProposals((prev) => prev?.map((p) => ({ ...p, accepted: false })) ?? null)}>Tout décocher</button>
              <button className="btn btn-primary" onClick={applyProposals} disabled={applyingProposals || proposals.every((p) => !p.accepted)}>
                {applyingProposals ? <span className="spinner" /> : '✓'} Appliquer
              </button>
              <button className="btn btn-secondary" onClick={() => setProposals(null)}>✕ Annuler</button>
            </div>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {proposals.map((p, idx) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <input
                  type="checkbox"
                  checked={p.accepted}
                  onChange={(e) => setProposals((prev) => prev?.map((x, i) => (i === idx ? { ...x, accepted: e.target.checked } : x)) ?? null)}
                  style={{ width: 'auto', flexShrink: 0 }}
                />
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{formatEur(p.amount)}</span>
                <CategoryPicker
                  value={p.category}
                  onChange={(v) => setProposals((prev) => prev?.map((x, i) => (i === idx ? { ...x, category: v } : x)) ?? null)}
                  categories={[...new Set([...COMMON_CATEGORIES, ...categories])].sort()}
                  style={{ width: 180 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicates panel */}
      {duplicates !== null && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--yellow)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--yellow)' }}>
              {duplicates.length === 0 ? 'Aucun doublon détecté' : `${duplicates.length} groupe(s) de doublons potentiels`}
            </span>
            <button className="btn btn-secondary" onClick={() => setDuplicates(null)}>✕ Fermer</button>
          </div>
          {duplicates.map((group, gIdx) => (
            <div key={gIdx} style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                {new Date(group.transactions[0].date).toLocaleDateString('fr-FR')} — {group.transactions[0].amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
              {group.transactions.map((tx) => (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                  {tx.category && <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{tx.category}</span>}
                  <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>id:{tx.id}</span>
                  <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)', whiteSpace: 'nowrap' }} onClick={() => deleteDuplicate(tx.id, gIdx)}>Supprimer</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Regex panel */}
      {regexPanel && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Catégoriser en masse :</span>
          <CategoryPicker
            value={regexPanel.category}
            onChange={(v) => setRegexPanel((p) => p ? { ...p, category: v } : null)}
            categories={[...new Set([...COMMON_CATEGORIES, ...categories])].sort()}
            placeholder="Catégorie"
            style={{ width: 160 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>Regex :</span>
            <input
              ref={patternRef}
              value={regexPanel.pattern}
              onChange={(e) => setRegexPanel((p) => p ? { ...p, pattern: e.target.value } : null)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              placeholder="ex: SNCF.*"
              onKeyDown={(e) => { if (e.key === 'Enter') applyRegex(); if (e.key === 'Escape') setRegexPanel(null) }}
            />
          </div>
          <span style={{ fontSize: 13, color: regexPanel.checking ? 'var(--text3)' : regexPanel.matchCount === 0 ? 'var(--red)' : 'var(--green)', whiteSpace: 'nowrap' }}>
            {regexPanel.checking ? '...' : regexPanel.matchCount === null ? '—' : `${regexPanel.matchCount} transaction(s)`}
          </span>
          <button className="btn btn-primary" onClick={applyRegex} disabled={!regexPanel.matchCount || regexPanel.checking || !regexPanel.category} style={{ whiteSpace: 'nowrap' }}>Appliquer</button>
          <button className="btn btn-secondary" onClick={() => setRegexPanel(null)}>✕</button>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--green)', color: '#fff', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      ) : transactions.length === 0 ? (
        <div className="empty-state"><p>Aucune transaction trouvée.</p></div>
      ) : (
        <>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <SortHeader field="date" label="Date" />
                <SortHeader field="description" label="Description" />
                <SortHeader field="category" label="Catégorie" />
                <SortHeader field="amount" label="Montant" align="right" />
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const isInternal = tx.is_internal === 1
                const hasNote = !!tx.note
                const txTags = tx.tags ? tx.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
                const isEditingNote = editingNote?.id === tx.id
                const toggleInternal = async () => {
                  await window.api.setTransactionInternal(tx.id, !isInternal)
                  load()
                }
                return (
                  <>
                  <tr key={tx.id} style={{ background: isInternal ? 'rgba(99,102,241,0.04)' : undefined }}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 13, opacity: isInternal ? 0.5 : 1 }}>
                      {new Date(tx.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isInternal && (
                            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--accent)', background: 'rgba(99,102,241,0.15)', borderRadius: 4, padding: '1px 5px', marginRight: 6 }}>
                              interne
                            </span>
                          )}
                          <span style={{ opacity: isInternal ? 0.45 : 1 }}>{tx.description}</span>
                        </div>
                        {txTags.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {txTags.map((tag) => (
                              <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', fontWeight: 500 }}>{tag}</span>
                            ))}
                          </div>
                        )}
                        {tx.note && (
                          <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {editing?.id === tx.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <CategoryPicker
                            inputRef={editRef}
                            value={newCategory}
                            onChange={setNewCategory}
                            categories={[...new Set([...COMMON_CATEGORIES, ...categories])].sort()}
                            onConfirm={() => commitEdit(tx.id, newCategory)}
                            onCancel={() => setEditing(null)}
                            style={{ width: 160 }}
                          />
                          <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => commitEdit(tx.id, newCategory)}>OK</button>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => openRegexPanel(tx)} title="Appliquer à des transactions similaires">OK pour tous</button>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditing(null)}>✕</button>
                        </div>
                      ) : (
                        <span className="category-badge" style={categoryBadgeStyle(tx.category)} onClick={() => startEdit(tx)} title="Cliquer pour modifier">
                          {tx.category || '+ Catégorie'}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: isInternal ? 0.4 : 1 }}>
                      <span className={tx.amount < 0 ? 'amount-negative' : 'amount-positive'}>
                        {formatEur(tx.amount)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setEditingNote(isEditingNote ? null : { id: tx.id, note: tx.note ?? '', tags: tx.tags ?? '' })}
                        title="Ajouter une note ou des tags"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1, color: hasNote || txTags.length > 0 ? 'var(--yellow)' : 'var(--border)', opacity: hasNote || txTags.length > 0 || isEditingNote ? 1 : 0 }}
                        className="internal-toggle"
                      >📝</button>
                      <button
                        onClick={toggleInternal}
                        title={isInternal ? 'Marquer comme externe' : 'Marquer comme virement interne'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1, color: isInternal ? 'var(--accent)' : 'var(--border)', opacity: isInternal ? 1 : 0 }}
                        className="internal-toggle"
                      >⇄</button>
                    </td>
                  </tr>
                  {isEditingNote && (
                    <tr key={`note-${tx.id}`}>
                      <td colSpan={5} style={{ padding: '0 0 10px 0', background: 'rgba(245,158,11,0.04)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                        <div style={{ display: 'flex', gap: 10, padding: '10px 12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
                            <label style={{ fontSize: 11, color: 'var(--text2)' }}>Note</label>
                            <textarea autoFocus value={editingNote.note} onChange={(e) => setEditingNote({ ...editingNote, note: e.target.value })} rows={2} style={{ fontSize: 12, resize: 'vertical', minHeight: 48 }} placeholder="Ajouter une note…" />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
                            <label style={{ fontSize: 11, color: 'var(--text2)' }}>Tags (séparés par des virgules)</label>
                            <input value={editingNote.tags} onChange={(e) => setEditingNote({ ...editingNote, tags: e.target.value })} style={{ fontSize: 12 }} placeholder="remboursement, médecin…" />
                          </div>
                          <div style={{ display: 'flex', gap: 6, paddingTop: 18 }}>
                            <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={saveNote}>Sauvegarder</button>
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditingNote(null)}>Annuler</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '16px 0', marginTop: 4 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 13 }}
              onClick={() => setPage(0)}
              disabled={page === 0}
            >«</button>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 13 }}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >‹ Préc.</button>
            <span style={{ fontSize: 13, color: 'var(--text2)', minWidth: 120, textAlign: 'center' }}>
              Page {page + 1} / {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 13 }}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >Suiv. ›</button>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 13 }}
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
            >»</button>
          </div>
        )}
        </>
      )}
    </div>
  )
}
