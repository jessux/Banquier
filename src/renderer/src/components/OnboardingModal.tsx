import { useEffect, useState } from 'react'
import { startConnect, usePowensJob } from '../utils/powensJob'
import type { NotificationsStatus, Settings } from '../../../shared/types'

interface Props {
  settings: Settings
  onDone: (saved: Partial<Settings>) => void
  onNavigate: (page: string) => void
}

// ---------- step sub-components ----------

function StepPowens({ onImport }: { onImport: () => void }): JSX.Element {
  // L'état vit dans le job partagé, pas dans ce composant : sur Android, le parcours
  // bancaire passe par un Custom Tab et l'activité peut être détruite pendant ce
  // temps. Un état local serait perdu au retour, laissant l'utilisateur devant un
  // bouton « Connecter ma banque » alors que la banque est déjà rattachée.
  const job = usePowensJob()

  const running = job.phase === 'webview' || job.phase === 'waiting' || job.phase === 'importing'
  const done = job.phase === 'done' && job.result !== null
  const imported = job.result?.imported ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Powens card */}
      <div style={{
        border: done ? '1.5px solid var(--green)' : '1.5px solid var(--accent)',
        borderRadius: 12, padding: '18px 20px',
        background: done ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.06)',
        transition: 'all 0.2s'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🏦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Connexion automatique</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
              Powens synchronise vos banques françaises en quelques secondes. Aucun identifiant stocké — Powens utilise OAuth2 directement avec votre banque.
            </div>
            {done ? (
              <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>
                ✓ Banque connectée{imported !== null ? ` · ${imported} transaction${imported > 1 ? 's' : ''} importée${imported > 1 ? 's' : ''}` : ''}
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => { void startConnect() }}
                disabled={running}
                style={{ fontSize: 13 }}
              >
                {running ? <><span className="spinner" style={{ marginRight: 6 }} />Connexion…</> : job.phase === 'error' ? 'Réessayer' : 'Connecter ma banque'}
              </button>
            )}
            {job.phase === 'error' && job.error && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{job.error}</div>
            )}
            {done && job.result?.warning && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--yellow)' }}>{job.result.warning}</div>
            )}
            {running && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)' }}>
                {job.message}
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text4)' }}>
                  Vous pouvez passer à l’étape suivante — la synchronisation continue en arrière-plan.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSV/PDF alternative */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>📂</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Import manuel</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
              Importez vos relevés CSV ou PDF depuis votre espace client bancaire. Compatible avec toutes les banques françaises.
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={onImport}>
              Importer un fichier CSV / PDF
            </button>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text4)', textAlign: 'center' }}>
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
          <div key={f.label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text4)', textAlign: 'center' }}>
        La page Transactions est votre vue principale — tout part de là.
      </p>
    </div>
  )
}

function StepCategorization(): JSX.Element {
  const methods = [
    {
      num: '1',
      color: 'var(--accent)',
      title: 'Clic direct',
      desc: 'Cliquez sur le badge de catégorie d\'une transaction pour la modifier instantanément.',
      detail: 'Idéal pour une transaction isolée.',
    },
    {
      num: '2',
      color: 'var(--yellow)',
      title: '"OK pour tous"',
      desc: 'Lors d\'une édition, "OK pour tous" crée une règle regex et catégorise toutes les transactions similaires.',
      detail: 'Parfait pour les marchands récurrents : Amazon, SNCF, Netflix…',
    },
    {
      num: '3',
      color: 'var(--green)',
      title: 'IA (1 clic)',
      desc: 'Avec une clé OpenRouter, le bouton "Catégoriser" traite tout en automatique.',
      detail: 'L\'IA apprend de vos règles existantes pour rester cohérente.',
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {methods.map((m) => (
        <div key={m.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.color, color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {m.num}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{m.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{m.desc}</div>
            <div style={{ fontSize: 11, color: 'var(--text4)', fontStyle: 'italic' }}>{m.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Opt-in aux notifications système. Affichée uniquement là où elles existent
 *  (Android) — cf. `window.api.notifications` optionnel. */
function StepNotifications(): JSX.Element {
  const [status, setStatus] = useState<NotificationsStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.notifications?.status().then(setStatus).catch(() => {})
  }, [])

  const enable = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.notifications?.request()
      if (next) {
        setStatus(next)
        if (next.granted) await window.api.notifications?.test()
      }
    } finally {
      setBusy(false)
    }
  }

  const granted = status?.granted === true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        border: granted ? '1.5px solid var(--green)' : '1.5px solid var(--accent)',
        borderRadius: 12, padding: '18px 20px',
        background: granted ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Notifications</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
              La synchronisation bancaire peut prendre plusieurs minutes. Avec les notifications,
              Banquier vous prévient dans la barre de statut dès qu’elle se termine — même si vous
              avez quitté l’application.
            </div>
            {granted ? (
              <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>✓ Notifications activées</div>
            ) : (
              <button className="btn btn-primary" onClick={enable} disabled={busy} style={{ fontSize: 13 }}>
                {busy ? <><span className="spinner" style={{ marginRight: 6 }} />Activation…</> : 'Activer les notifications'}
              </button>
            )}
            {status !== null && !granted && !busy && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text4)' }}>
                Refusé ? Vous pourrez les réactiver dans les paramètres Android de Banquier.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Vous serez prévenu pour :</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { icon: '🏦', text: 'Nouvelles transactions récupérées auprès de votre banque' },
            { icon: '🎯', text: 'Budget mensuel dépassé' },
            { icon: '⚠️', text: 'Banque à reconnecter (authentification forte expirée)' },
          ].map((r) => (
            <div key={r.text} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>{r.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text4)', margin: 0, textAlign: 'center' }}>
        Optionnel — réglable à tout moment dans Paramètres → Notifications.
      </p>
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

  const openLink = (): void => {
    window.api.openExternal('https://openrouter.ai/workspaces/default/keys')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Explication */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'rgba(99,102,241,0.04)' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>Qu'est-ce qu'OpenRouter ?</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>
          OpenRouter est un service qui donne accès à des dizaines de modèles d'IA (Claude, GPT-4, Gemini…)
          via <strong style={{ color: 'var(--text)' }}>une seule clé API</strong>.
          Banquier l'utilise pour catégoriser vos transactions automatiquement.
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>
          Le modèle <strong style={{ color: 'var(--accent-light)' }}>openrouter/free</strong> est <strong style={{ color: 'var(--text)' }}>entièrement gratuit</strong> et
          largement suffisant pour la catégorisation.
        </div>
      </div>

      {/* Étapes pour obtenir la clé */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>Comment obtenir votre clé ?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { n: '1', text: 'Créez un compte gratuit sur openrouter.ai' },
            { n: '2', text: 'Allez dans Workspaces → Keys' },
            { n: '3', text: 'Cliquez "Create key" et copiez la clé générée' },
          ].map(({ n, text }) => (
            <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1e2130', border: '1px solid var(--border)', color: 'var(--accent)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{text}</span>
            </div>
          ))}
        </div>
        <button
          onClick={openLink}
          style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: 'var(--accent-light)', fontSize: 13, fontWeight: 500 }}
        >
          <span>Ouvrir openrouter.ai/keys</span>
          <span style={{ fontSize: 11 }}>↗</span>
        </button>
      </div>

      {/* Saisie */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label style={{ fontSize: 12 }}>Votre clé API</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-v1-…"
            style={{ fontSize: 13 }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label style={{ fontSize: 12 }}>Modèle</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ fontSize: 13 }}>
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text4)', margin: 0 }}>
        Optionnel — sans clé, tout le reste de Banquier fonctionne normalement.
      </p>
    </div>
  )
}

// ---------- main modal ----------

export default function OnboardingModal({ settings, onDone, onNavigate }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState(settings.openrouterApiKey || '')
  const [model, setModel] = useState(settings.openrouterModel || 'openrouter/free')

  // L'étape notifications n'existe que là où les notifications système sont
  // portées (Android) : sur desktop elle serait un écran vide.
  const hasNotifications = !!window.api.notifications

  const finish = async (): Promise<void> => {
    onDone({ openrouterApiKey: apiKey, openrouterModel: model, onboardingDone: true })
  }

  const skip = async (): Promise<void> => {
    onDone({ onboardingDone: true })
  }

  const steps: { label: string; content: JSX.Element }[] = [
    {
      label: 'Connexion',
      content: <StepPowens key="powens" onImport={() => { skip(); onNavigate('import') }} />
    },
    { label: 'Transactions', content: <StepTransactions key="tx" /> },
    { label: 'Catégorisation', content: <StepCategorization key="cat" /> },
    ...(hasNotifications
      ? [{ label: 'Notifications', content: <StepNotifications key="notif" /> }]
      : []),
    {
      label: 'Configuration IA',
      content: <StepAI key="ai" apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />
    }
  ]

  const STEPS = steps.map((s) => s.label)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{
        background: '#13151f', border: '1px solid var(--border)', borderRadius: 18,
        width: 540, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
        padding: '28px 32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Étape {step + 1} sur {STEPS.length}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{STEPS[step]}</h2>
          </div>
          <button
            onClick={skip}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 18, padding: '2px 4px', lineHeight: 1 }}
            title="Fermer l'onboarding"
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 5, margin: '20px 0' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 4, borderRadius: 3,
                background: i < step ? '#4f46e5' : i === step ? 'var(--accent-light)' : '#1e2130',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Step content */}
        <div style={{ minHeight: 220 }}>
          {steps[step].content}
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

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {step < STEPS.length - 1 ? (
              <>
                <button
                  onClick={() => setStep((s) => s + 1)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 13, padding: '4px 8px' }}
                >
                  Passer cette étape
                </button>
                <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
                  Suivant →
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={finish}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 13, padding: '4px 8px' }}
                >
                  Passer cette étape
                </button>
                <button className="btn btn-primary" onClick={finish} style={{ padding: '8px 24px' }}>
                  Commencer 🚀
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
