import { useState } from 'react'
import type { Settings } from '../../types'
import { phaseFor } from '../../engine/mesocycle'
import { SetupPage, type UpdateSettings } from './shared'

const BLOCK_LENGTHS = [3, 4, 5, 6]

export function ProgressionPage({ settings, update, onBack }: {
  settings: Settings
  update: UpdateSettings
  onBack: () => void
}) {
  return (
    <SetupPage
      title="Progression"
      blurb="How hard the coach pushes: the shape of your training block, and whether the day’s prescription bends to how you turn up feeling."
      onBack={onBack}
    >
      <div className="section-label">Training block</div>
      <TrainingBlock settings={settings} update={update} />

      <div className="section-label">Autoregulation</div>
      <div className="card pane">
        <div className="settings-row">
          <div>
            <div className="k">Readiness check</div>
            <div className="sub">
              Asks how you’re feeling before each session and bends the day’s prescription to match —
              a rough night trims a set and backs the load off 10%, a good one earns an extra set.
            </div>
          </div>
          <button
            className={`toggle${settings.readinessCheck ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.readinessCheck === true}
            aria-label="Readiness check"
            onClick={() => update({ readinessCheck: !settings.readinessCheck })}
          />
        </div>
      </div>
    </SetupPage>
  )
}

function TrainingBlock({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const [weeks, setWeeks] = useState(settings.meso?.weeks ?? 4)
  const phase = phaseFor(settings.meso, Date.now())

  const start = () => update({ meso: { startAt: Date.now(), weeks } })
  const end = () => update({ meso: null })

  if (settings.meso && phase) {
    return (
      <div className="card pane">
        <div className="settings-row">
          <div>
            <div className="k">{phase.label}</div>
            <div className="sub">{phase.note}</div>
          </div>
          <button className="btn-small" onClick={end}>End block</button>
        </div>
        <div className="sub" style={{ paddingTop: 'var(--s2)' }}>
          Accumulation weeks ramp your prescribed sets; the last week is a planned deload. The block
          rolls into a fresh cycle automatically.
        </div>
      </div>
    )
  }

  return (
    <div className="card pane">
      <div className="settings-row stack">
        <div>
          <div className="k">Run a mesocycle</div>
          <div className="sub">
            Ramp volume week to week, then auto-schedule a deload — structured progression instead of grinding every session.
          </div>
        </div>
        <div className="seg" role="radiogroup" aria-label="Block length" style={{ marginTop: 'var(--s3)' }}>
          {BLOCK_LENGTHS.map((w) => (
            <button key={w} role="radio" aria-checked={weeks === w}
              className={weeks === w ? 'on' : ''} onClick={() => setWeeks(w)}>{w} wk</button>
          ))}
        </div>
        <button className="btn-primary" style={{ marginTop: 'var(--s4)' }} onClick={start}>
          Start {weeks}-week block
        </button>
      </div>
    </div>
  )
}
