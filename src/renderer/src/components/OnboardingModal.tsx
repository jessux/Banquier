import { useState } from 'react'
import type { Settings } from '../../../shared/types'

interface Props {
  settings: Settings
  onDone: (saved: Partial<Settings>) => void
  onNavigate: (page: string) => void
}

const STEPS = ['Connexion', 'Transactions', 'Catégorisation', 'Configuration IA']

// ---------- step sub-components ----------

function StepPowens({
  onConnect,
  onImport,
}: {
  onConnect: () => Promise<void>
  onImport: () => void
}): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [imported, setImported] = useState<number | null>(null)

  const connect = async (): Promise<void> => {
    setStatus('busy')
    setMsg("Autorisez l'accès dans la fenêtre de votre banque…")
    try {
      await onConnect()
      // onConnect sets internal state — we just reflect success
      setStatus('done')
      setMsg('')
    } catch (e) {
      setStatus('error')
      setMsg(String(e instanceof Error ? e.message : e))
    }
  }

  // Exposed so parent can read back result
  void imported

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Powens card */}
      <div style={{
        border: status === 'done' ? '1.5px solid #22c55e' : '1.5px solid #6366f1',
        borderRadius: 12, padding: '18px 20px',
        background: status === 'done' ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.06)',
        transition: 'all 0.2s'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🏦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Connexion automatique</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
              Powens synchronise vos banques françaises en quelques secondes. Aucun identifiant stocké — Powens utilise OAuth2 directement avec votre banque.
            </div>
            {status === 'done' ? (
              <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>
                ✓ Banque connectée{imported !== null ? ` · ${imported} transactions importées` : ''}
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={connect}
                disabled={status === 'busy'}
                style={{ fontSize: 13 }}
              >
                {status === 'busy' ? <><span className="spinner" style={{ marginRight: 6 }} />Connexion…</> : 'Connecter ma banque'}
              </button>
            )}
            {status === 'error' && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>{msg}</div>
            )}
            {status === 'busy' && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>{msg}</div>
            )}
          </div>
        </div>
      </div>

      {/* CSV/PDF alternative */}
      <div style={{ border: '1px solid #2e3147', borderRadius: 12, padding: '16px 20px', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>📂</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Import manuel</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
              Importez vos relevés CSV ou PDF depuis votre espace client bancaire. Compatible avec toutes les banques françaises.
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={onImport}>
              Importer un fichier CSV / PDF
            </button>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
        Vous pourrez ajouter d'autres comptes ou banques à tout moment dans les Paramètres.
      </p>
    </div>
  )
}

function StepTransactions(): JSX.Element {
  const features = [
    { icon: '🔍', label: 'Recherche et filtres', desc: 'Texte libre, catégorie, compte, mois, montant, tags…' },
    { icon: '🗂️', label: 'Tri multi-critères', desc: 'Par date, montant, description ou catégorie — côté base de données.' },
    { icon: '📝', label: 'Notes & tags', desc: 'Annotez et taguez librement chaque transaction.' },
    { icon: '⇄', label: 'Virements internes', desc: 'Marquez les transferts entre vos comptes pour les exclure des stats.' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {features.map((f) => (
          <div key={f.label} style={{ border: '1px solid #2e3147', borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
        La page Transactions est votre vue principale — tout part de là.
      </p>
    </div>
  )
}

function StepCategorization(): JSX.Element {
  const methods = [
    {
      num: '1',
      color: '#6366f1',
      title: 'Clic direct',
      desc: 'Cliquez sur le badge de catégorie d\'une transaction pour la modifier instantanément.',
      detail: 'Idéal pour une transaction isolée.',
    },
    {
      num: '2',
      color: '#f59e0b',
      title: '"OK pour tous"',
      desc: 'Lors d\'une édition, "OK pour tous" crée une règle regex et catégorise toutes les transactions similaires.',
      detail: 'Parfait pour les marchands récurrents : Amazon, SNCF, Netflix…',
    },
    {
      num: '3',
      color: '#22c55e',
      title: 'IA (1 clic)',
      desc: 'Avec une clé OpenRouter, le bouton "Catégoriser" traite tout en automatique.',
      detail: 'L\'IA apprend de vos règles existantes pour rester cohérente.',
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {methods.map((m) => (
        <div key={m.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', border: '1px solid #2e3147', borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.color, color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {m.num}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{m.title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{m.desc}</div>
            <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>{m.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StepAI({
  apiKey, setApiKey, model, setModel,
}: {
  apiKey: string
  setApiKey: (v: string) => void
  model: string
  setModel: (v: string) => void
}): JSX.Element {
  const MODELS = [
    { value: 'openrouter/free', label: 'Auto (gratuit)' },
    { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (rapide)' },
    { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (puissant)' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ border: '1px solid #2e3147', borderRadius: 10, padding: '16px 18px', background: 'rgba(99,102,241,0.04)' }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 }}>
          OpenRouter donne accès à Claude, GPT-4, Gemini et d'autres modèles via une seule clé API.
          Le plan gratuit (<strong style={{ color: '#e2e8f0' }}>openrouter/free</strong>) suffit pour la catégorisation.
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12 }}>Clé API OpenRouter</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-v1-…"
            style={{ fontSize: 13 }}
          />
          <p style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            Obtenez votre clé sur <strong style={{ color: '#818cf8' }}>openrouter.ai</strong>
          </p>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Modèle</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ fontSize: 13 }}>
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            <option value="__custom__" disabled>— Modèle personnalisé (modifier dans Paramètres)</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
        Optionnel — sans clé, tout le reste fonctionne normalement. Vous pourrez la configurer plus tard dans <strong style={{ color: '#64748b' }}>Paramètres → OpenRouter</strong>.
      </p>
    </div>
  )
}

// ---------- main modal ----------

export default function OnboardingModal({ settings, onDone, onNavigate }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [powensResult, setPowensResult] = useState<{ imported: number } | null>(null)
  const [apiKey, setApiKey] = useState(settings.openrouterApiKey || '')
  const [model, setModel] = useState(settings.openrouterModel || 'openrouter/free')

  const connectPowens = async (): Promise<void> => {
    const res = await window.api.powensConnect()
    setPowensResult({ imported: res.imported })
  }

  const finish = async (): Promise<void> => {
    onDone({ openrouterApiKey: apiKey, openrouterModel: model, onboardingDone: true })
  }

  const skip = async (): Promise<void> => {
    onDone({ onboardingDone: true })
  }

  const stepContent = [
    <StepPowens
      key="powens"
      onConnect={connectPowens}
      onImport={() => { skip(); onNavigate('import') }}
    />,
    <StepTransactions key="tx" />,
    <StepCategorization key="cat" />,
    <StepAI key="ai" apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />,
  ]

  void powensResult

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{
        background: '#13151f', border: '1px solid #2e3147', borderRadius: 18,
        width: 540, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
        padding: '28px 32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Étape {step + 1} sur {STEPS.length}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{STEPS[step]}</h2>
          </div>
          <button
            onClick={skip}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 13, padding: '4px 0', marginTop: 4 }}
          >
            Passer l'onboarding
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 5, margin: '20px 0' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 4, borderRadius: 3,
                background: i < step ? '#4f46e5' : i === step ? '#818cf8' : '#1e2130',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Step content */}
        <div style={{ minHeight: 220 }}>
          {stepContent[step]}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid #1e2130' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setStep((s) => s - 1)}
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          >
            ← Précédent
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
                Suivant →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={finish} style={{ padding: '8px 24px' }}>
                Commencer 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
