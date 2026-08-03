import { useEffect, useMemo, useState } from 'react'
import type { Session } from '../types'
import {
  TRANSITION_SEC, cooldownEntries, cooldownPhases, cooldownSessionKind, formatDuration, trackName,
  type CooldownPlan,
} from '../engine/cooldown'
import { saveSession } from '../db/db'
import { pushSession } from '../db/sync'
import { useWakeLock } from '../hooks/useWakeLock'
import { beep } from '../components/chime'
import { CheckIcon, CloseIcon } from '../components/Icons'

interface CooldownProps {
  plan: CooldownPlan
  soundOn: boolean
  onLogged: () => Promise<void>
  onDone: () => void
}

/**
 * The cool-down, run rather than read. Post-session mobility fails on the
 * counting, not the willingness: you hold the first stretch, lose track at
 * twenty seconds, and the other two never happen. So the block drives itself —
 * one movement on screen at a time, the clock running, the next one queued —
 * and what actually got done is logged the way the Stretch and Condition tabs
 * log it, so it counts towards staleness and volume like anything else.
 */
export function CooldownScreen({ plan, soundOn, onLogged, onDone }: CooldownProps) {
  const phases = useMemo(() => cooldownPhases(plan.items), [plan])

  const [index, setIndex] = useState(0)
  /**
   * When Begin was pressed, and the session's start time with it; null until
   * then. The block used to open with its clock already running, so the first
   * movement was a third gone by the time you'd put the phone down and got on
   * the mat — the countdown now waits for you.
   */
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endsAt, setEndsAt] = useState(0)
  /** Milliseconds left on the current phase while paused; null = running. */
  const [pausedLeft, setPausedLeft] = useState<number | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(Date.now())

  const ready = startedAt === null

  // Holds are 30–45 seconds of not touching the phone; the screen must not
  // sleep in the middle of one. Nothing to keep awake before Begin.
  useWakeLock(!ready && !finished)

  useEffect(() => {
    if (ready || finished || pausedLeft !== null) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [ready, finished, pausedLeft])

  const begin = () => {
    const t = Date.now()
    setNow(t)
    setStartedAt(t)
    setEndsAt(t + (phases[0]?.sec ?? 0) * 1000)
  }

  /**
   * Move to `to`. Leaving a movement counts it as done unless it was skipped —
   * a block you bailed out of halfway shouldn't log holds you never took.
   */
  const advance = (to: number, complete: boolean, sound: boolean) => {
    const from = phases[index].itemIndex
    if (complete && (to >= phases.length || phases[to].itemIndex !== from)) {
      setDone((d) => new Set(d).add(from))
    }
    if (sound) {
      if (soundOn) beep()
      if (navigator.vibrate) navigator.vibrate(140)
    }
    if (to >= phases.length) {
      setFinished(true)
      return
    }
    setIndex(to)
    setEndsAt(Date.now() + phases[to].sec * 1000)
    setPausedLeft(null)
  }

  // The clock, not a tick count, decides when a phase is over — a backgrounded
  // tab stops firing intervals, and coming back should land where it should.
  useEffect(() => {
    if (ready || finished || phases.length === 0 || pausedLeft !== null || now < endsAt) return
    advance(index + 1, true, phases[index].kind === 'work')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, endsAt, ready, finished, pausedLeft, index])

  if (finished || phases.length === 0) {
    return (
      <CooldownDone
        plan={plan}
        doneIndices={[...done].sort((a, b) => a - b)}
        saving={saving}
        onLog={async (items) => {
          setSaving(true)
          const session: Session = {
            uuid: crypto.randomUUID(),
            dayType: cooldownSessionKind(plan.track),
            startedAt: startedAt ?? Date.now(),
            finishedAt: Date.now(),
            entries: cooldownEntries(items),
          }
          void pushSession(await saveSession(session))
          await onLogged()
          onDone()
        }}
        onDismiss={onDone}
      />
    )
  }

  const phase = phases[Math.min(index, phases.length - 1)]
  const item = plan.items[phase.itemIndex]
  const leftMs = pausedLeft ?? Math.max(0, endsAt - now)
  const secs = Math.ceil(leftMs / 1000)
  const frac = ready ? 0 : phase.sec > 0 ? Math.min(1, 1 - leftMs / (phase.sec * 1000)) : 1
  const R = 54
  const C = 2 * Math.PI * R

  const skipMovement = () => {
    const next = phases.findIndex((p) => p.itemIndex > phase.itemIndex)
    advance(next === -1 ? phases.length : next, false, false)
  }

  return (
    <>
      <div className="workout-header">
        <button className="icon-btn" aria-label="End cool-down"
          onClick={() => (done.size > 0 ? setFinished(true) : onDone())}>
          <CloseIcon size={20} />
        </button>
        <div className="wh-title">
          <div className="wh-day">{trackName(plan.track)}</div>
          <div className="count num">
            Movement {phase.itemIndex + 1} of {plan.items.length}
          </div>
        </div>
        <span style={{ width: 38 }} />
      </div>

      <div className="workout-progress" aria-hidden="true">
        {plan.items.map((it, i) => (
          <i key={it.id} className={done.has(i) ? 'done' : i === phase.itemIndex ? 'at' : ''} />
        ))}
      </div>

      <div className={`cool-stage ${ready ? 'ready' : phase.kind}`}>
        {/* Announced, because the screen is the instruction: without this a
            screen-reader user hears nothing when a hold switches sides. */}
        <div className="cool-phase" aria-live="polite">
          {ready ? 'Up first' : pausedLeft !== null ? 'Paused' : phase.label}
        </div>
        <div className="cool-ring">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r={R} stroke="var(--line-2)" strokeWidth="6" fill="none" />
            <circle
              cx="66" cy="66" r={R}
              stroke={phase.kind === 'work' ? 'var(--ember)' : 'var(--text-faint)'}
              strokeWidth="6" fill="none" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              transform="rotate(-90 66 66)"
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          </svg>
          {/* Before Begin there's nothing to count down, so the ring holds
              what the block is going to cost you instead. */}
          {ready
            ? <div className="cool-count num">{formatDuration(plan.totalSec)}</div>
            : <div className="cool-count num" role="timer" aria-live="off">{secs}</div>}
        </div>

        <h1 className="cool-name">{item.name}</h1>
        <div className="cool-meta num">
          {item.prescription}
          {item.trimmed && <span className="cool-trim"> · trimmed to fit</span>}
        </div>
        <p className="cool-cue">{item.cue}</p>
      </div>

      {ready ? (
        <>
          <button className="btn-primary" onClick={begin}>Begin</button>
          <p className="cool-begin-note">
            {TRANSITION_SEC} seconds to get into position, then the block runs itself.
          </p>
        </>
      ) : (
        <>
          <div className="cool-controls">
            <button className="btn-ghost"
              onClick={() => (pausedLeft === null
                ? setPausedLeft(Math.max(0, endsAt - Date.now()))
                : (setEndsAt(Date.now() + pausedLeft), setPausedLeft(null)))}>
              {pausedLeft === null ? 'Pause' : 'Resume'}
            </button>
            <button className="btn-primary" onClick={() => advance(index + 1, true, false)}>
              {index === phases.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
          <button className="btn-small" style={{ marginTop: 'var(--s3)' }} onClick={skipMovement}>
            Skip {item.name}
          </button>
        </>
      )}

      <div className="section-label">
        <span>The block</span>
        <span>{formatDuration(plan.totalSec)}</span>
      </div>
      <div className="card pane">
        {plan.items.map((it, i) => (
          <div className={`cool-row${done.has(i) ? ' done' : ''}${i === phase.itemIndex ? ' at' : ''}`} key={it.id}>
            <span className="check" aria-hidden="true"><CheckIcon /></span>
            <div>
              <div className="top">
                <span className="name">{it.name}</span>
                <span className="hold num">{it.prescription}</span>
              </div>
              <div className="targets">{it.targets}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function CooldownDone({ plan, doneIndices, saving, onLog, onDismiss }: {
  plan: CooldownPlan
  doneIndices: number[]
  saving: boolean
  onLog: (items: CooldownPlan['items']) => Promise<void>
  onDismiss: () => void
}) {
  const items = doneIndices.map((i) => plan.items[i])
  const seconds = items.reduce((t, i) => t + i.seconds, 0)
  const noun = plan.track === 'core' ? 'movement' : 'hold'

  return (
    <>
      <h1 className="screen-title">{items.length > 0 ? 'Cool-down done' : 'Cool-down ended'}</h1>
      <p className="screen-sub">
        {items.length > 0
          ? `${trackName(plan.track)} — ${formatDuration(seconds)} done while you were still warm.`
          : 'Nothing logged. It’ll be waiting after the next session.'}
      </p>

      {items.length > 0 && (
        <div className="card pane">
          {items.map((it) => (
            <div className="cool-row done" key={it.id}>
              <span className="check" aria-hidden="true"><CheckIcon /></span>
              <div>
                <div className="top">
                  <span className="name">{it.name}</span>
                  <span className="hold num">{it.prescription}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 'var(--s5)' }} />
      {items.length > 0 && (
        <button className="btn-primary" disabled={saving} onClick={() => void onLog(items)}>
          Log {items.length} {noun}{items.length > 1 ? 's' : ''} done
        </button>
      )}
      <button className="btn-ghost mt-3" onClick={onDismiss}>
        {items.length > 0 ? 'Don’t log' : 'Back to Train'}
      </button>
    </>
  )
}
