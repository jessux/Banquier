import { useEffect, useState } from 'react'
import type {
  CategorizationStats,
  CategorySource,
  MerchantMemoryEntry,
  Settings
} from '../../../shared/types'

/** Libellés des sources automatiques annulables en bloc. */
const REVERTABLE: { source: CategorySource; label: string; hint: string }[] = [
  { source: 'memory', label: 'mémoire marchand', hint: 'vos décisions rejouées' },
  { source: 'fuzzy', label: 'rapprochements', hint: 'marchands proches de vos décisions' },
  { source: 'dict', label: 'dictionnaire', hint: 'enseignes reconnues d’office' },
  { source: 'ai', label: 'IA', hint: 'propositions que vous avez validées' }
]

const MEMORY_PAGE = 12

/**
 * Pilotage de la catégorisation : ce qui se fait tout seul, ce qui a été
 * mémorisé, et comment défaire une vague mal partie.
 *
 * Le taux d'automatisation est la mesure qui compte — la précision d'un modèle
 * ne dit rien de la pénibilité réellement ressentie.
 */
export default function CategorizationPanel(): JSX.Element {
  const [stats, setStats] = useState<CategorizationStats | null>(null)
  const [memory, setMemory] = useState<MerchantMemoryEntry[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)

  const load = (): void => {
    window.api.getCategorizationStats().then(setStats)
    window.api.getMerchantMemory().then(setMemory)
    window.api.getSettings().then(setSettings)
  }

  useEffect(load, [])

  const notify = (message: string): void => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const forget = async (merchantKey: string): Promise<void> => {
    await window.api.forgetMerchantCategory(merchantKey)
    setMemory((prev) => prev.filter((m) => m.merchant_key !== merchantKey))
    notify(`« ${merchantKey} » oublié`)
  }

  const clearAll = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.clearMerchantMemory()
      setConfirmClear(false)
      load()
      notify('Mémoire vidée')
    } finally {
      setBusy(false)
    }
  }

  const revert = async (source: CategorySource, label: string): Promise<void> => {
    setBusy(true)
    try {
      const count = await window.api.clearCategoriesBySource(source)
      load()
      notify(
        count > 0
          ? `${count} transaction(s) remises sans catégorie (${label})`
          : `Aucune catégorie posée par ${label}`
      )
    } finally {
      setBusy(false)
    }
  }

  const filtered = memory.filter(
    (m) =>
      !search ||
      m.merchant_key.toLowerCase().includes(search.toLowerCase()) ||
      m.category.toLowerCase().includes(search.toLowerCase())
  )
  const visible = expanded ? filtered : filtered.slice(0, MEMORY_PAGE)

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 4 }}>Catégorisation</h3>
      <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
        Vos corrections sont mémorisées par marchand et rejouées aux imports suivants.
      </p>

      {stats && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--accent-light)' }}>
              {stats.automaticRate === null ? '—' : `${Math.round(stats.automaticRate * 100)} %`}
            </span>
            <span className="text-muted text-sm">catégorisées sans intervention</span>
          </div>
          <div className="text-muted text-sm">
            {stats.automatic} automatique(s) · {stats.manual} à la main
            {stats.unknownSource > 0 && ` · ${stats.unknownSource} d’avant le suivi`}
            {stats.uncategorized > 0 && ` · ${stats.uncategorized} sans catégorie`}
          </div>
          {stats.automaticRate === null && (
            <div className="text-muted text-sm" style={{ marginTop: 6 }}>
              Le taux apparaîtra après le premier import catégorisé.
            </div>
          )}
        </div>
      )}

      {settings && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.autoCategorizeAi ?? false}
            style={{ width: 'auto', marginTop: 3 }}
            onChange={async (e) => {
              const next = { ...settings, autoCategorizeAi: e.target.checked }
              setSettings(next)
              await window.api.saveSettings(next)
            }}
          />
          <span>
            <strong style={{ fontSize: 14 }}>Catégorisation IA automatique à l’import</strong>
            <span className="text-muted text-sm" style={{ display: 'block' }}>
              Applique d’office les propositions sûres, laisse les marchands douteux à vérifier.
              Nécessite une clé OpenRouter et envoie les libellés concernés au service.
            </span>
          </span>
        </label>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Mémoire marchand ({memory.length})</strong>
          {memory.length > 0 && (
            confirmClear ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={clearAll} disabled={busy}>
                  Confirmer l’oubli total
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>Annuler</button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => setConfirmClear(true)}>Tout oublier</button>
            )
          )}
        </div>

        {memory.length === 0 ? (
          <p className="text-muted text-sm">
            Rien de mémorisé pour l’instant. Chaque catégorie que vous posez viendra ici.
          </p>
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer un marchand ou une catégorie…"
              style={{ marginBottom: 10 }}
            />
            {visible.map((entry) => (
              <div
                key={entry.merchant_key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.merchant_key}
                </span>
                <span style={{ fontSize: 12, color: 'var(--accent-light)', whiteSpace: 'nowrap' }}>
                  {entry.category}
                </span>
                <span className="text-muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                  ×{entry.count}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 10px', fontSize: 12 }}
                  onClick={() => forget(entry.merchant_key)}
                >
                  Oublier
                </button>
              </div>
            ))}
            {filtered.length > MEMORY_PAGE && (
              <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Réduire' : `Voir les ${filtered.length - MEMORY_PAGE} autres`}
              </button>
            )}
            {filtered.length === 0 && (
              <p className="text-muted text-sm">Aucun marchand ne correspond.</p>
            )}
          </>
        )}
      </div>

      <div>
        <strong style={{ fontSize: 14 }}>Annuler en bloc</strong>
        <p className="text-muted text-sm" style={{ margin: '4px 0 10px' }}>
          Remet sans catégorie ce qu’une source a posé. Vos choix manuels ne sont jamais touchés.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {REVERTABLE.map(({ source, label, hint }) => (
            <button
              key={source}
              className="btn btn-secondary"
              disabled={busy}
              title={hint}
              onClick={() => revert(source, label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-light)' }}>{toast}</div>
      )}
    </div>
  )
}
