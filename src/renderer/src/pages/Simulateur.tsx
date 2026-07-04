import { Fragment, useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const euro = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

const num = (s: string): number => parseFloat(s.replace(',', '.')) || 0

type Mode = 'forward' | 'inverse'

interface FreqOption {
  label: string
  value: number   // in years
  periodLabel: (i: number) => string
  summaryLabel: string
}

const FREQ_OPTIONS: FreqOption[] = [
  {
    label: 'Quotidien',
    value: 1 / 365,
    periodLabel: (i) => `Jour ${i + 1}`,
    summaryLabel: 'par jour'
  },
  {
    label: 'Hebdomadaire',
    value: 1 / 52,
    periodLabel: (i) => `Semaine ${i + 1}`,
    summaryLabel: 'par semaine'
  },
  {
    label: 'Mensuel',
    value: 1 / 12,
    periodLabel: (i) => `Mois ${i + 1}`,
    summaryLabel: 'par mois'
  },
  {
    label: 'Trimestriel',
    value: 0.25,
    periodLabel: (i) => `Trimestre ${i + 1}`,
    summaryLabel: 'par trimestre'
  },
  {
    label: 'Semestriel',
    value: 0.5,
    periodLabel: (i) => `Semestre ${i + 1}`,
    summaryLabel: 'par semestre'
  },
  {
    label: 'Annuel',
    value: 1,
    periodLabel: (i) => `An ${i}`,
    summaryLabel: 'par an'
  },
  {
    label: 'Tous les 2 ans',
    value: 2,
    periodLabel: (i) => `An ${i * 2}`,
    summaryLabel: 'tous les 2 ans'
  },
  {
    label: 'Tous les 3 ans',
    value: 3,
    periodLabel: (i) => `An ${i * 3}`,
    summaryLabel: 'tous les 3 ans'
  },
  {
    label: 'Tous les 5 ans',
    value: 5,
    periodLabel: (i) => `An ${i * 5}`,
    summaryLabel: 'tous les 5 ans'
  },
]

interface ScheduleRow {
  index: number
  period: string
  paid: number
  interest: number
  capital: number
}

interface SimResult {
  pmt: number
  targetCapital: number
  nPayments: number
  totalPaid: number
  totalInterest: number
  schedule: ScheduleRow[]
  chartData: { year: number; capital: number }[]
  noPaymentNeeded: boolean
}

function buildResult(
  initialCapital: number,
  durationYears: number,
  freqYears: number,
  freqCompYears: number,
  annualRate: number,
  rPeriod: number,
  pmt: number,
  targetCapital: number,
  freq: FreqOption
): SimResult {
  const nPeriods = Math.floor(durationYears / freqYears + 1e-9)
  const nPayments = nPeriods + 1

  // Show interest only on compounding dates when compounding is less frequent than payments
  const compRatio = freqCompYears / freqYears
  const showCompSeparately = freqCompYears > freqYears + 1e-9 && Math.abs(compRatio - Math.round(compRatio)) < 1e-9

  const schedule: ScheduleRow[] = []
  let cap = initialCapital
  let prevCap = initialCapital
  let lastCompoundCap = initialCapital
  let paymentsSinceLastComp = 0

  for (let i = 0; i < nPayments; i++) {
    const compPeriodsElapsed = i * freqYears / freqCompYears
    const isCompDate = showCompSeparately && i > 0 && Math.abs(compPeriodsElapsed % 1) < 1e-9

    let interest = 0
    if (isCompDate) {
      interest = cap - lastCompoundCap - pmt * paymentsSinceLastComp
    } else if (!showCompSeparately) {
      interest = i === 0 ? 0 : cap - prevCap
    }

    cap += pmt

    if (showCompSeparately) {
      if (isCompDate) {
        // Le versement du jour est déjà inclus dans lastCompoundCap : repartir de zéro.
        lastCompoundCap = cap
        paymentsSinceLastComp = 0
      } else {
        paymentsSinceLastComp++
      }
    }

    schedule.push({ index: i + 1, period: freq.periodLabel(i), paid: pmt, interest, capital: cap })
    prevCap = cap
    if (i < nPayments - 1) cap *= 1 + rPeriod
  }

  // Chart always year-by-year, interpolated from schedule points
  const chartYears = Math.ceil(durationYears)
  const chartData: { year: number; capital: number }[] = []
  for (let y = 0; y <= chartYears; y++) {
    const lastIdx = Math.min(nPeriods, Math.floor(y / freqYears + 1e-9))
    const yearsGrown = y - lastIdx * freqYears
    const c = schedule[lastIdx].capital * Math.pow(1 + annualRate, yearsGrown)
    chartData.push({ year: y, capital: parseFloat(c.toFixed(2)) })
  }

  const totalPaid = pmt * nPayments
  const totalInterest = targetCapital - initialCapital - totalPaid

  return { pmt, targetCapital, nPayments, totalPaid, totalInterest, schedule, chartData, noPaymentNeeded: false }
}

function computeForward(
  targetCapital: number,
  durationYears: number,
  freq: FreqOption,
  freqCompound: FreqOption,
  annualRate: number,
  initialCapital: number
): SimResult | null {
  if (durationYears <= 0 || targetCapital <= 0) return null
  const freqYears = freq.value
  const nPeriods = Math.floor(durationYears / freqYears + 1e-9)
  const nPayments = nPeriods + 1
  const remainder = durationYears - nPeriods * freqYears
  const rPeriod = annualRate > 1e-10 ? Math.pow(1 + annualRate, freqYears) - 1 : 0
  const adjustedTarget = targetCapital / Math.pow(1 + annualRate, remainder)
  const adjustedC0 = initialCapital * Math.pow(1 + annualRate, nPeriods * freqYears)

  if (adjustedC0 >= adjustedTarget) {
    const chartData: { year: number; capital: number }[] = []
    let c = initialCapital
    for (let y = 0; y <= Math.ceil(durationYears); y++) {
      chartData.push({ year: y, capital: parseFloat(c.toFixed(2)) })
      if (y < durationYears) c *= 1 + annualRate
    }
    return {
      pmt: 0, targetCapital, nPayments: 0, totalPaid: 0,
      totalInterest: adjustedC0 * Math.pow(1 + annualRate, remainder) - initialCapital,
      schedule: [], chartData, noPaymentNeeded: true
    }
  }

  const annuityFactor = rPeriod > 1e-10
    ? (Math.pow(1 + rPeriod, nPayments) - 1) / rPeriod
    : nPayments

  const pmt = (adjustedTarget - adjustedC0) / annuityFactor
  return buildResult(initialCapital, durationYears, freqYears, freqCompound.value, annualRate, rPeriod, pmt, targetCapital, freq)
}

function computeInverse(
  pmt: number,
  durationYears: number,
  freq: FreqOption,
  freqCompound: FreqOption,
  annualRate: number,
  initialCapital: number
): SimResult | null {
  if (durationYears <= 0 || pmt < 0) return null
  const freqYears = freq.value
  const nPeriods = Math.floor(durationYears / freqYears + 1e-9)
  const nPayments = nPeriods + 1
  const remainder = durationYears - nPeriods * freqYears
  const rPeriod = annualRate > 1e-10 ? Math.pow(1 + annualRate, freqYears) - 1 : 0
  const c0AtLastPayment = initialCapital * Math.pow(1 + annualRate, nPeriods * freqYears)
  const annuityFactor = rPeriod > 1e-10
    ? (Math.pow(1 + rPeriod, nPayments) - 1) / rPeriod
    : nPayments
  const targetCapital = (c0AtLastPayment + pmt * annuityFactor) * Math.pow(1 + annualRate, remainder)
  return buildResult(initialCapital, durationYears, freqYears, freqCompound.value, annualRate, rPeriod, pmt, targetCapital, freq)
}

const SCHEDULE_HEAD = 24
const SCHEDULE_TAIL = 6

export default function Simulateur(): JSX.Element {
  const [mode, setMode] = useState<Mode>('forward')
  const [targetStr, setTargetStr] = useState('10000')
  const [pmtStr, setPmtStr] = useState('100')
  const [durationStr, setDurationStr] = useState('10')
  const [freqKey, setFreqKey] = useState('Mensuel')
  const [freqCompoundKey, setFreqCompoundKey] = useState('Annuel')
  const [rateStr, setRateStr] = useState('3')
  const [initialStr, setInitialStr] = useState('0')

  const freq = FREQ_OPTIONS.find(f => f.label === freqKey) ?? FREQ_OPTIONS[2]
  const freqCompound = FREQ_OPTIONS.find(f => f.label === freqCompoundKey) ?? FREQ_OPTIONS[5]

  const result = useMemo(() => {
    const duration = num(durationStr)
    const rate = num(rateStr) / 100
    const initial = num(initialStr)
    if (duration <= 0) return null
    if (mode === 'forward') return computeForward(num(targetStr), duration, freq, freqCompound, rate, initial)
    return computeInverse(num(pmtStr), duration, freq, freqCompound, rate, initial)
  }, [mode, targetStr, pmtStr, durationStr, freq, freqCompound, rateStr, initialStr])

  const scheduleRows = result?.schedule ?? []
  const tooLong = scheduleRows.length > SCHEDULE_HEAD + SCHEDULE_TAIL
  const visibleRows = tooLong
    ? [...scheduleRows.slice(0, SCHEDULE_HEAD), ...scheduleRows.slice(-SCHEDULE_TAIL)]
    : scheduleRows
  const hiddenCount = tooLong ? scheduleRows.length - SCHEDULE_HEAD - SCHEDULE_TAIL : 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Simulateur d'épargne</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`btn ${mode === 'forward' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('forward')}
        >
          Calculer le versement
        </button>
        <button
          className={`btn ${mode === 'inverse' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('inverse')}
        >
          Calculer le capital final
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Paramètres</div>
        <div className="grid-2" style={{ gap: 16 }}>
          {mode === 'forward' ? (
            <div className="form-group">
              <label>Capital cible (€)</label>
              <input
                value={targetStr}
                onChange={(e) => setTargetStr(e.target.value)}
                placeholder="10000"
                inputMode="decimal"
              />
            </div>
          ) : (
            <div className="form-group">
              <label>Versement (€)</label>
              <input
                value={pmtStr}
                onChange={(e) => setPmtStr(e.target.value)}
                placeholder="100"
                inputMode="decimal"
              />
            </div>
          )}
          <div className="form-group">
            <label>Durée (années)</label>
            <input
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              placeholder="10"
              inputMode="decimal"
            />
          </div>
          <div className="form-group">
            <label>Fréquence des versements</label>
            <select value={freqKey} onChange={(e) => setFreqKey(e.target.value)}>
              {FREQ_OPTIONS.map((f) => (
                <option key={f.label} value={f.label}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Fréquence de capitalisation</label>
            <select value={freqCompoundKey} onChange={(e) => setFreqCompoundKey(e.target.value)}>
              {FREQ_OPTIONS.map((f) => (
                <option key={f.label} value={f.label}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Taux de rendement annuel (%)</label>
            <input
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              placeholder="3"
              inputMode="decimal"
            />
          </div>
          <div className="form-group">
            <label>Capital de départ (€)</label>
            <input
              value={initialStr}
              onChange={(e) => setInitialStr(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </div>
        </div>
      </div>

      {!result && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-muted">Renseignez les paramètres pour lancer la simulation.</p>
        </div>
      )}

      {result?.noPaymentNeeded && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ fontWeight: 600, fontSize: 16 }}>Aucun versement nécessaire</p>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Votre capital de départ suffit à atteindre l'objectif au taux de {rateStr} %.
          </p>
        </div>
      )}

      {result && !result.noPaymentNeeded && (
        <>
          <div className="grid-2" style={{ gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ textAlign: 'center', padding: 28 }}>
              {mode === 'forward' ? (
                <>
                  <div className="text-muted text-sm">Versement à effectuer</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#6366f1', margin: '10px 0 4px' }}>
                    {euro(result.pmt)}
                  </div>
                  <div className="text-muted text-sm">
                    {freq.summaryLabel} · {result.nPayments} versements
                  </div>
                </>
              ) : (
                <>
                  <div className="text-muted text-sm">Capital final</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#6366f1', margin: '10px 0 4px' }}>
                    {euro(result.targetCapital)}
                  </div>
                  <div className="text-muted text-sm">
                    {euro(result.pmt)} {freq.summaryLabel} · {result.nPayments} versements
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">Durée</span>
                  <span style={{ fontWeight: 600 }}>{durationStr} ans</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">Total versé</span>
                  <span style={{ fontWeight: 600 }}>{euro(result.totalPaid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">Intérêts générés</span>
                  <span style={{ fontWeight: 600, color: '#22c55e' }}>+{euro(result.totalInterest)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <span className="text-muted text-sm">Capital final</span>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>{euro(result.targetCapital)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Évolution du capital</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={result.chartData}>
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3147" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => `An ${v}`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => euro(v)}
                  width={95}
                />
                <Tooltip
                  formatter={(v: number) => [euro(v), 'Capital']}
                  labelFormatter={(v) => `Année ${v}`}
                />
                <Area type="monotone" dataKey="capital" stroke="#6366f1" fill="url(#simGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>
              Échéancier
              {tooLong && (
                <span className="text-muted text-sm" style={{ marginLeft: 8, fontWeight: 400 }}>
                  ({result.nPayments} versements — extrait)
                </span>
              )}
            </div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text2, #94a3b8)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>#</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Période</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Versement</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Intérêts</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Capital acquis</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => (
                  <Fragment key={row.index}>
                    {tooLong && idx === SCHEDULE_HEAD && (
                      <tr>
                        <td colSpan={5} style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text2, #94a3b8)', fontSize: 12 }}>
                          ··· {hiddenCount} versements ···
                        </td>
                      </tr>
                    )}
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: row.index === result.nPayments ? 'rgba(99,102,241,0.08)' : undefined
                      }}
                    >
                      <td style={{ padding: '6px 8px', color: 'var(--text2, #94a3b8)' }}>{row.index}</td>
                      <td style={{ padding: '6px 8px' }}>{row.period}</td>
                      <td style={{ padding: '6px 8px' }}>{euro(row.paid)}</td>
                      <td style={{ padding: '6px 8px', color: row.interest > 0 ? '#22c55e' : 'var(--text2, #94a3b8)' }}>
                        {row.interest > 0 ? `+${euro(row.interest)}` : '—'}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: row.index === result.nPayments ? 700 : undefined }}>
                        {euro(row.capital)}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
