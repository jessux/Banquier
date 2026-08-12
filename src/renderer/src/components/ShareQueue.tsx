import { useEffect, useState } from 'react'
import type { SharePartition } from '../../../shared/ruleSharing'

/** Dépôt communautaire recevant les propositions. */
const RULES_REPO = 'https://github.com/jessux/banquier-rules'

/** Au-delà, l'URL d'issue GitHub devient trop longue : on envoie par lots. */
const MAX_RULES_PER_ISSUE = 40

/**
 * Grille commune aux deux listes : case/croix, motif, puis catégorie ou motif
 * de refus. Les colonnes s'alignent d'une section à l'autre, et les libellés
 * longs sont tronqués plutôt que de casser la hauteur des lignes.
 */
const ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '16px minmax(0, 260px) minmax(0, 1fr)',
  alignItems: 'center',
  gap: 12,
  padding: '7px 8px',
  borderRadius: 6,
  cursor: 'pointer'
}

const CELL_PATTERN: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: 'var(--accent)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const SECTION_HEADER: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text3)',
  margin: '18px 0 8px',
  paddingTop: 12,
  borderTop: '1px solid var(--border)'
}

const CELL_CATEGORY: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text2)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

interface Props {
  /** Rechargement demandé au parent après un envoi. */
  onChange: () => void
  onToast: (message: string) => void
  /** Incrémenté par le parent à chaque modification des règles, pour resynchroniser la file. */
  reloadToken: number
}

/**
 * File locale des règles proposables au dépôt communautaire.
 *
 * Rien ne part automatiquement : l'application accumule les candidates, les
 * filtre (voir src/shared/ruleSharing.ts) et n'envoie qu'après relecture
 * explicite. Seuls le pattern et la catégorie sortent — jamais un libellé de
 * transaction, un montant ni une date.
 */
export default function ShareQueue({ onChange, onToast, reloadToken }: Props): JSX.Element | null {
  const [partition, setPartition] = useState<SharePartition | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const load = async (): Promise<void> => {
    const result = await window.api.getSharePartition()
    setPartition(result)
    // Seules les règles sans réserve sont pré-cochées. Celles de la liste
    // « à vérifier » exigent un geste délibéré : c'est ce qui rend un raté de
    // détection inoffensif.
    setSelected(new Set(result.candidates.map((c) => c.id)))
  }

  useEffect(() => {
    load()
  }, [reloadToken])

  if (!partition) return null

  const { candidates, review, rejected } = partition
  if (candidates.length === 0 && review.length === 0 && rejected.length === 0) return null

  const selectable = [...candidates, ...review]
  const chosen = selectable.filter((c) => selected.has(c.id))

  const send = (): void => {
    if (chosen.length === 0) return
    const batch = chosen.slice(0, MAX_RULES_PER_ISSUE)

    const body = [
      `### ${batch.length} règle(s) proposée(s)`,
      '',
      '```json',
      JSON.stringify(
        batch.map((r) => ({ pattern: r.pattern, category: r.category })),
        null,
        2
      ),
      '```',
      '',
      '> Envoyé depuis Banquier. Ces règles ne contiennent ni libellé de',
      '> transaction, ni montant, ni date : uniquement un motif de recherche et',
      '> une catégorie.',
      '',
      '### Pays / banque',
      '',
      'France / '
    ].join('\n')

    const params = new URLSearchParams({
      title: `${batch.length} règle(s) proposée(s) par la communauté`,
      labels: 'nouvelle-règle',
      body
    })

    window.api.openExternal(`${RULES_REPO}/issues/new?${params.toString()}`)
    window.api.markRulesShared(batch.map((r) => r.pattern)).then(() => {
      onToast(
        batch.length < chosen.length
          ? `${batch.length} règle(s) envoyée(s) — relancez pour les ${chosen.length - batch.length} restantes`
          : `${batch.length} règle(s) envoyée(s)`
      )
      setOpen(false)
      // onChange() fait remonter le rechargement au parent, qui incrémente
      // reloadToken et redéclenche notre propre load().
      onChange()
    })
  }

  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 16
        }}
      >
        <span style={{ fontSize: 13 }}>
          {candidates.length > 0
            ? `${candidates.length} règle(s) prête(s) à être partagée(s) avec la communauté`
            : 'Aucune règle prête à être partagée'}
        </span>
        {review.length > 0 && (
          <span className="text-muted text-sm">· {review.length} à vérifier</span>
        )}
        {rejected.length > 0 && (
          <span className="text-muted text-sm">
            · {rejected.length} écartée(s) pour protection des données
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => setOpen(true)}
        >
          Voir
        </button>
        {selectable.length > 0 && (
          <button
            className="btn btn-primary"
            style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => setOpen(true)}
          >
            Partager
          </button>
        )}
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              width: 'min(720px, 100%)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Partager mes règles</h2>
              <p className="text-muted text-sm" style={{ margin: '6px 0 0' }}>
                Seuls le motif et la catégorie sont transmis. Aucun libellé de transaction,
                aucun montant, aucune date ne quitte votre appareil.
              </p>
            </div>

            <div style={{ overflowY: 'auto', padding: '12px 20px', flex: 1 }}>
              {candidates.length > 0 && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--text3)',
                      marginBottom: 8
                    }}
                  >
                    <span>À PARTAGER ({candidates.filter((c) => selected.has(c.id)).length}/{candidates.length})</span>
                    <div style={{ flex: 1 }} />
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => {
                        const allOn = candidates.every((c) => selected.has(c.id))
                        setSelected((prev) => {
                          const next = new Set(prev)
                          for (const c of candidates) {
                            if (allOn) next.delete(c.id)
                            else next.add(c.id)
                          }
                          return next
                        })
                      }}
                    >
                      {candidates.every((c) => selected.has(c.id)) ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                  {candidates.map((rule) => (
                    <label key={rule.id} style={ROW} className="share-row">
                      <input
                        type="checkbox"
                        checked={selected.has(rule.id)}
                        onChange={() => toggle(rule.id)}
                        // `input { width: 100% }` dans styles.css étire la case
                        // et pousse le reste de la ligne : on fixe la taille.
                        style={{ width: 16, height: 16, margin: 0, padding: 0, accentColor: 'var(--accent)' }}
                      />
                      <code style={CELL_PATTERN} title={rule.pattern}>
                        {rule.pattern}
                      </code>
                      <span style={CELL_CATEGORY} title={rule.category}>
                        {rule.category}
                      </span>
                    </label>
                  ))}
                </>
              )}

              {review.length > 0 && (
                <>
                  <div style={SECTION_HEADER}>
                    À VÉRIFIER ({review.length}) — décochées : confirmez qu’il ne s’agit pas d’une personne
                  </div>
                  {review.map((rule) => (
                    <label key={rule.id} style={ROW} className="share-row">
                      <input
                        type="checkbox"
                        checked={selected.has(rule.id)}
                        onChange={() => toggle(rule.id)}
                        style={{ width: 16, height: 16, margin: 0, padding: 0, accentColor: 'var(--accent)' }}
                      />
                      <code style={{ ...CELL_PATTERN, color: 'var(--yellow, #eab308)' }} title={rule.pattern}>
                        {rule.pattern}
                      </code>
                      <span style={CELL_CATEGORY} title={rule.detail}>
                        {rule.detail}
                      </span>
                    </label>
                  ))}
                </>
              )}

              {rejected.length > 0 && (
                <>
                  <div style={SECTION_HEADER}>
                    NON PARTAGÉES ({rejected.length}) — conservées sur votre appareil
                  </div>
                  {rejected.map((rule) => (
                    <div key={rule.id} style={ROW}>
                      <span style={{ color: 'var(--text3)', fontSize: 11, textAlign: 'center' }}>✕</span>
                      <code style={{ ...CELL_PATTERN, color: 'var(--text3)' }} title={rule.pattern}>
                        {rule.pattern}
                      </code>
                      <span style={CELL_CATEGORY}>{rule.detail}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end'
              }}
            >
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Fermer
              </button>
              <button className="btn btn-primary" disabled={chosen.length === 0} onClick={send}>
                Ouvrir la proposition ({chosen.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
