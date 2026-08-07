import { useEffect, useRef, useState } from 'react'
import type { Account, CsvMapping, CsvPreview, Import as ImportRecord, ImportResult } from '../../../shared/types'

type Step = 'drop' | 'mapping' | 'result'

const DATE_FORMATS = ['DD/MM/YYYY', 'DD/MM/YY', 'MM/DD/YYYY', 'YYYY-MM-DD']
const DELIMITERS = [
  { label: 'Virgule (,)', value: ',' },
  { label: 'Point-virgule (;)', value: ';' },
  { label: 'Tabulation', value: '\t' }
]

const FIELD_OPTIONS = [
  { value: '', label: '— ignorer —' },
  { value: '__date__', label: 'Date' },
  { value: '__description__', label: 'Description' },
  { value: '__amount__', label: 'Montant (signé)' },
  { value: '__debit__', label: 'Débit' },
  { value: '__credit__', label: 'Crédit' }
]

export default function Import(): JSX.Element {
  const [step, setStep] = useState<Step>('drop')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileType, setFileType] = useState<'csv' | 'pdf' | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY')
  const [delimiter, setDelimiter] = useState(',')
  const [skipRows, setSkipRows] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [deletingImportId, setDeletingImportId] = useState<number | null>(null)

  useEffect(() => {
    window.api.getAccounts().then(setAccounts)
    loadImports()
  }, [])

  const loadImports = (): void => {
    window.api.getImports().then(setImports)
  }

  const handleDeleteImport = async (importId: number): Promise<void> => {
    await window.api.deleteTransactions(importId)
    setImports((prev) => prev.filter((i) => i.id !== importId))
    setDeletingImportId(null)
  }

  const handleFilePick = async (): Promise<void> => {
    const path = await window.api.openFileDialog([
      { name: 'Relevés bancaires', extensions: ['csv', 'pdf'] }
    ])
    if (!path) return
    await loadFile(path)
  }

  const loadFile = async (path: string): Promise<void> => {
    setError(null)
    setFilePath(path)
    const ext = path.split('.').pop()?.toLowerCase()
    if (ext === 'csv') {
      setFileType('csv')
      try {
        const p = await window.api.previewCsv(path)
        setPreview(p)
        setDelimiter(p.detectedDelimiter)

        // Auto-map common column names — first match wins to avoid duplicate date columns
        const autoMap: Record<string, string> = {}
        const used = new Set<string>()
        p.headers.forEach((h) => {
          const lower = h.toLowerCase()
          // Date: prefer "début" or exact "date", avoid "fin" if date already mapped
          if (!used.has('__date__') && lower.includes('date') && !lower.includes('fin')) {
            autoMap[h] = '__date__'; used.add('__date__')
          } else if (!used.has('__description__') && (lower.includes('lib') || lower.includes('opér') || lower.includes('label') || lower === 'description' || lower.includes('desc'))) {
            autoMap[h] = '__description__'; used.add('__description__')
          } else if (!used.has('__amount__') && (lower.includes('montant') || lower === 'amount')) {
            autoMap[h] = '__amount__'; used.add('__amount__')
          } else if (!used.has('__debit__') && (lower.includes('débit') || lower.includes('debit'))) {
            autoMap[h] = '__debit__'; used.add('__debit__')
          } else if (!used.has('__credit__') && (lower.includes('crédit') || lower.includes('credit'))) {
            autoMap[h] = '__credit__'; used.add('__credit__')
          }
        })
        // Auto-detect date format from first data row
        const firstDateVal = p.rows[0]?.[p.headers.findIndex(h => autoMap[h] === '__date__')]
        if (firstDateVal && /^\d{4}-\d{2}-\d{2}/.test(firstDateVal.trim())) {
          setDateFormat('YYYY-MM-DD')
        } else if (firstDateVal && /^\d{2}\/\d{2}\/\d{4}/.test(firstDateVal.trim())) {
          setDateFormat('DD/MM/YYYY')
        }
        setColumnMap(autoMap)
        setStep('mapping')
      } catch (e) {
        setError(String(e))
      }
    } else if (ext === 'pdf') {
      setFileType('pdf')
      setStep('mapping')
    } else {
      setError('Format non supporté. Utilisez un fichier CSV ou PDF.')
    }
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    // In Electron, we can get the path from the file object
    const path = (file as File & { path: string }).path
    loadFile(path)
  }

  const buildMapping = (): CsvMapping | null => {
    if (!preview) return null
    let dateCol = '', descriptionCol = '', amountCol: string | null = null
    let debitCol: string | null = null, creditCol: string | null = null

    Object.entries(columnMap).forEach(([header, role]) => {
      if (role === '__date__') dateCol = header
      else if (role === '__description__') descriptionCol = header
      else if (role === '__amount__') amountCol = header
      else if (role === '__debit__') debitCol = header
      else if (role === '__credit__') creditCol = header
    })

    if (!dateCol || !descriptionCol || (!amountCol && !debitCol)) {
      setError('Veuillez mapper au moins : Date, Description, et Montant (ou Débit).')
      return null
    }

    return { dateCol, descriptionCol, amountCol, debitCol, creditCol, dateFormat, delimiter, skipRows }
  }

  const handleImport = async (): Promise<void> => {
    if (!filePath) return
    setError(null)
    setLoading(true)

    try {
      let res: ImportResult
      if (fileType === 'csv') {
        const mapping = buildMapping()
        if (!mapping) { setLoading(false); return }
        res = await window.api.importCsv(filePath, mapping, accountId)
      } else {
        res = await window.api.importPdf(filePath, accountId)
      }
      setResult(res)
      setStep('result')
      loadImports()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const reset = (): void => {
    setStep('drop')
    setFilePath(null)
    setFileType(null)
    setPreview(null)
    setColumnMap({})
    setResult(null)
    setError(null)
  }

  const filename = filePath ? filePath.split(/[\\/]/).pop() : ''

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Importer un relevé</h1>
      </div>

      {step === 'drop' && (
        <>
          <div
            ref={dropRef}
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={handleFilePick}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="drop-zone-icon">📂</div>
            <p style={{ fontSize: 16, marginBottom: 6 }}>Glissez un fichier ici ou cliquez pour parcourir</p>
            <p className="text-muted text-sm">Formats supportés : CSV, PDF</p>
          </div>
          {error && <p style={{ color: 'var(--red)', marginTop: 12 }}>{error}</p>}

          {imports.length > 0 && (
            <div className="card" style={{ marginTop: 24 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Historique des imports</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {imports.map((imp) => (
                  <div
                    key={imp.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 4px', borderBottom: '1px solid var(--border)', gap: 12
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {imp.filename || 'Import sans nom'}
                      </div>
                      <div className="text-muted text-sm">
                        {new Date(imp.imported_at).toLocaleString('fr-FR')} · {imp.transaction_count} transaction{imp.transaction_count > 1 ? 's' : ''}
                      </div>
                    </div>
                    {deletingImportId === imp.id ? (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <span className="text-sm" style={{ color: 'var(--red)', alignSelf: 'center' }}>Supprimer ?</span>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }} onClick={() => handleDeleteImport(imp.id)}>Oui</button>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setDeletingImportId(null)}>Non</button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)', flexShrink: 0 }}
                        onClick={() => setDeletingImportId(imp.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {step === 'mapping' && (
        <div style={{ maxWidth: 700 }}>
          <p className="text-muted" style={{ marginBottom: 20 }}>
            Fichier : <strong>{filename}</strong>
          </p>

          {accounts.length > 0 && (
            <div className="form-group">
              <label>Compte bancaire (optionnel)</label>
              <select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Aucun compte associé</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>
                ))}
              </select>
            </div>
          )}

          {fileType === 'csv' && preview && (
            <>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Format de date</label>
                  <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                    {DATE_FORMATS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Séparateur CSV</label>
                  <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
                    {DELIMITERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Correspondance des colonnes</div>
                <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="mapping-table" style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th style={{ background: 'none', padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }}>Colonne CSV</th>
                      <th style={{ background: 'none', padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }}>Correspond à</th>
                      <th style={{ background: 'none', padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }}>Exemple</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.headers.map((h, i) => (
                      <tr key={h}>
                        <td style={{ fontWeight: 500 }}>{h}</td>
                        <td>
                          <select
                            value={columnMap[h] ?? ''}
                            onChange={(e) => setColumnMap({ ...columnMap, [h]: e.target.value })}
                            style={{ width: 200 }}
                          >
                            {FIELD_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="text-muted text-sm">{preview.rows[0]?.[i] ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}

          {fileType === 'pdf' && (
            <div className="card" style={{ marginBottom: 20 }}>
              <p style={{ marginBottom: 8 }}>Le PDF sera analysé localement pour extraire les transactions — aucune donnée n'est envoyée en ligne.</p>
              <p className="text-muted text-sm">Fonctionne avec les relevés au format Date / Nature / Valeur / Débit / Crédit (BNP Paribas et la plupart des banques françaises).</p>
            </div>
          )}

          {error && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={reset}>Retour</button>
            <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? <><span className="spinner" />Importation...</> : 'Importer'}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div style={{ maxWidth: 500 }}>
          <div className="card">
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 16 }}>
              {result.errors > 0 ? '⚠️' : '✅'}
            </div>
            <h2 style={{ textAlign: 'center', marginBottom: 20 }}>Import terminé</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="flex justify-between">
                <span>Transactions importées</span>
                <span className="badge badge-success">{result.imported}</span>
              </div>
              <div className="flex justify-between">
                <span>Doublons ignorés</span>
                <span className="badge badge-warning">{result.duplicates}</span>
              </div>
              {result.errors > 0 && (
                <div className="flex justify-between">
                  <span>Erreurs</span>
                  <span className="badge badge-error">{result.errors}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={reset}>Importer un autre fichier</button>
          </div>
        </div>
      )}
    </div>
  )
}
