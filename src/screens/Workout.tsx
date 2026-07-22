import { useEffect, useMemo, useState } from 'react'
import type { Session, SetLog, Settings } from '../types'
import { getExercise } from '../data/exercises'
import { dayById } from '../data/days'
import { suggestFor } from '../engine/progression'
import { warmupRamp } from '../engine/warmup'
import { platesPerSide } from '../engine/plates'
import { newPRsInSession } from '../engine/stats'
import { saveSession } from '../db/db'
import { pushSession } from '../db/sync'
import { Stepper, formatNum } from '../components/Stepper'
import { RestTimer } from '../components/RestTimer'
import { BackIcon, TrashIcon } from '../components/Icons'
import type { ActiveWorkout } from '../App'

const KIND_LABEL = {
  increase: 'Level up', build: 'Beat last time', start: 'First time', deload: 'Deload & rebuild',
} as const

interface WorkoutProps {
  active: ActiveWorkout
  setActive: (w: ActiveWorkout | null) => void
  history: Session[]
  settings: Settings
  onFinished: () => Promise<void>
}

export function WorkoutScreen({ active, setActive, history, settings, onFinished }: WorkoutProps) {
  const [summary, setSummary] = useState<{ session: Session; prs: ReturnType<typeof newPRsInSession> } | null>(null)
  const [rest, setRest] = useState<{ startedAt: number; durationSec: number } | null>(null)

  const exercise = getExercise(active.exerciseIds[active.currentIndex])
  const suggestion = useMemo(() => suggestFor(exercise, history, settings), [exercise, history, settings])
  const loggedSets = active.logged[exercise.id] ?? []

  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(0)
  const [rpe, setRpe] = useState<number | undefined>(undefined)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Reset the input to continue from the last logged set of this workout,
  // otherwise from the engine's suggestion.
  const seedInputs = () => {
    const prior = active.logged[exercise.id]
    if (prior && prior.length > 0) {
      setWeight(prior[prior.length - 1].weight)
      setReps(prior[prior.length - 1].reps)
    } else {
      setWeight(suggestion.weight)
      setReps(suggestion.targetReps)
    }
    setRpe(undefined)
    setNote('')
    setShowNote(false)
    setEditingIndex(null)
  }

  // Re-seed whenever the exercise changes.
  useEffect(() => {
    seedInputs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id])

  const warmups = useMemo(
    () => (loggedSets.length === 0 && suggestion.kind !== 'start' ? warmupRamp(exercise, suggestion.weight, settings) : []),
    [exercise, suggestion, settings, loggedSets.length],
  )

  const plates = exercise.barLoaded && weight > 0
    ? platesPerSide(weight, settings.barWeightKg, settings.platesKg)
    : null

  const writeSets = (sets: SetLog[]) => setActive({ ...active, logged: { ...active.logged, [exercise.id]: sets } })

  const commitSet = () => {
    const set: SetLog = { weight, reps }
    if (rpe !== undefined) set.rpe = rpe
    if (note.trim()) set.note = note.trim()

    if (editingIndex !== null) {
      const next = loggedSets.map((s, i) => (i === editingIndex ? set : s))
      writeSets(next)
      setEditingIndex(null)
      const last = next[next.length - 1]
      setWeight(last.weight)
      setReps(last.reps)
      setRpe(undefined)
      setNote('')
      setShowNote(false)
      return
    }

    writeSets([...loggedSets, set])
    setRpe(undefined)
    setNote('')
    setShowNote(false)
    setRest({ startedAt: Date.now(), durationSec: exercise.restSec })
  }

  const editSet = (i: number) => {
    const s = loggedSets[i]
    setEditingIndex(i)
    setWeight(s.weight)
    setReps(s.reps)
    setRpe(s.rpe)
    setNote(s.note ?? '')
    setShowNote(!!s.note)
    setRest(null)
  }

  const deleteSet = (i: number) => {
    writeSets(loggedSets.filter((_, idx) => idx !== i))
    seedInputs()
  }

  const go = (delta: number) => {
    const next = active.currentIndex + delta
    if (next >= 0 && next < active.exerciseIds.length) {
      setActive({ ...active, currentIndex: next })
      setRest(null)
    }
  }

  const finish = async () => {
    const entries = active.exerciseIds
      .map((id) => ({ exerciseId: id, sets: active.logged[id] ?? [] }))
      .filter((e) => e.sets.length > 0)
    if (entries.length === 0) {
      setActive(null)
      return
    }
    const session: Session = {
      uuid: crypto.randomUUID(),
      dayType: active.dayType,
      startedAt: active.startedAt,
      finishedAt: Date.now(),
      entries,
    }
    await saveSession(session)
    void pushSession(session)
    const prs = newPRsInSession(session, [session, ...history])
    await onFinished()
    setRest(null)
    setSummary({ session, prs })
  }

  if (summary) {
    return <SummaryView summary={summary} dayType={active.dayType} onDone={() => setActive(null)} />
  }

  const dayName = dayById.get(active.dayType)?.name ?? active.dayType
  const isLast = active.currentIndex === active.exerciseIds.length - 1

  return (
    <>
      <div className="workout-header">
        <button onClick={() => go(-1)} disabled={active.currentIndex === 0}
          style={{ color: active.currentIndex === 0 ? 'var(--text-faint)' : 'var(--text)' }}>
          <BackIcon />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{dayName}</div>
          <div className="count num">{active.currentIndex + 1} / {active.exerciseIds.length}</div>
        </div>
        <button className="btn-small" onClick={finish}>Finish</button>
      </div>

      <h1 className="screen-title" style={{ fontSize: 24 }}>{exercise.name}</h1>
      <p className="screen-sub" style={{ marginBottom: 14 }}>{exercise.cue}</p>

      <div className={`suggestion ${suggestion.kind}`}>
        <div className="kind">{KIND_LABEL[suggestion.kind]}</div>
        <div className="target num">
          {suggestion.kind === 'start'
            ? <>{suggestion.sets} × {suggestion.targetReps} <small>find your weight</small></>
            : <>{formatNum(suggestion.weight)} kg × {suggestion.targetReps} <small>× {suggestion.sets} sets</small></>}
        </div>
        <div className="why">{suggestion.reason}</div>
      </div>

      {warmups.length > 0 && (
        <div className="card warmup-list">
          <div className="section-label" style={{ margin: '0 0 6px' }}>Warm-up ramp</div>
          {warmups.map((w, i) => (
            <div className="w-row num" key={i}>
              <span>{w.label}</span>
              <span>{formatNum(w.weight)} kg × {w.reps}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stepper-row">
        <Stepper label="Weight" value={weight} unit="kg" step={exercise.barLoaded ? 2.5 : 1}
          bigStep={exercise.barLoaded ? 10 : 5} onChange={setWeight} />
        <Stepper label="Reps" value={reps} step={1} onChange={setReps} />
      </div>

      {plates && plates.length > 0 && (
        <div className="plates-hint num">Per side: {plates.map(formatNum).join(' · ')}</div>
      )}

      <div className="rpe-picker">
        {[6, 7, 8, 9, 10].map((r) => (
          <button key={r} className={rpe === r ? 'on' : ''}
            onClick={() => setRpe(rpe === r ? undefined : r)}>
            RPE {r}
          </button>
        ))}
      </div>

      {showNote ? (
        <input
          style={{ width: '100%', margin: '8px 0' }}
          placeholder="Note — grip, tempo, tweaks…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      ) : (
        <button className="btn-small" style={{ margin: '8px 0' }} onClick={() => setShowNote(true)}>
          + note
        </button>
      )}

      <button className="btn-primary" onClick={commitSet} disabled={reps <= 0}
        style={{ opacity: reps <= 0 ? 0.4 : 1, marginTop: 6 }}>
        {editingIndex !== null ? `Update set ${editingIndex + 1}` : `Log set ${loggedSets.length + 1}`}
      </button>
      {editingIndex !== null && (
        <button className="btn-ghost" style={{ marginTop: 8 }} onClick={seedInputs}>
          Cancel edit
        </button>
      )}

      {loggedSets.length > 0 && (
        <div className="set-log">
          <div className="section-label" style={{ marginTop: 18 }}>Logged — tap to edit</div>
          {loggedSets.map((s, i) => (
            <div className={`set-row${editingIndex === i ? ' editing' : ''}`} key={i}>
              <button className="set-tap" onClick={() => editSet(i)}>
                <span className="idx num">S{i + 1}</span>
                <span className={`load num${s.reps >= suggestion.targetReps ? ' hit' : ''}`}>
                  {formatNum(s.weight)} kg × {s.reps}
                </span>
                <span className="rpe-note">
                  {s.rpe !== undefined && `RPE ${s.rpe}`}{s.rpe !== undefined && s.note ? ' · ' : ''}{s.note}
                </span>
              </button>
              <button className="set-del" aria-label={`Delete set ${i + 1}`} onClick={() => deleteSet(i)}>
                <TrashIcon size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 16 }} />
      {!isLast ? (
        <button className="btn-ghost" onClick={() => go(1)}>
          Next: {getExercise(active.exerciseIds[active.currentIndex + 1]).name}
        </button>
      ) : (
        <button className="btn-ghost" onClick={finish}>Finish workout</button>
      )}

      {rest && (
        <RestTimer
          startedAt={rest.startedAt}
          durationSec={rest.durationSec}
          soundOn={settings.soundOn}
          onDismiss={() => setRest(null)}
        />
      )}
    </>
  )
}

function SummaryView({ summary, dayType, onDone }: {
  summary: { session: Session; prs: ReturnType<typeof newPRsInSession> }
  dayType: string
  onDone: () => void
}) {
  const { session, prs } = summary
  const totalSets = session.entries.reduce((t, e) => t + e.sets.length, 0)
  const tonnage = session.entries.reduce(
    (t, e) => t + e.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0)
  const mins = Math.round(((session.finishedAt ?? session.startedAt) - session.startedAt) / 60000)
  const dayName = dayById.get(dayType as never)?.name ?? dayType

  return (
    <>
      <h1 className="screen-title">Session done</h1>
      <p className="screen-sub">{dayName} — logged and folded into your next suggestions.</p>

      <div className="summary-stat-row">
        <div className="summary-stat"><div className="v num">{totalSets}</div><div className="k">Sets</div></div>
        <div className="summary-stat"><div className="v num">{formatTonnage(tonnage)}</div><div className="k">Tonnage</div></div>
        <div className="summary-stat"><div className="v num">{mins}′</div><div className="k">Minutes</div></div>
      </div>

      {prs.map((pr) => (
        <div className="pr-flash" key={`${pr.exerciseId}-${pr.kind}`}>
          <div className="pr-kind">{pr.kind === 'weight' ? 'New weight PR' : 'New est. 1RM PR'}</div>
          <div className="pr-line">
            {getExercise(pr.exerciseId).name} — <span className="num">{formatNum(pr.weight)} kg × {pr.reps}</span>
          </div>
        </div>
      ))}
      {prs.length === 0 && (
        <div className="card" style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          No PRs today — showing up is the PR. The engine has adjusted your next targets.
        </div>
      )}

      <div style={{ height: 20 }} />
      <button className="btn-primary" onClick={onDone}>Done</button>
    </>
  )
}

function formatTonnage(kg: number): string {
  return kg >= 10000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}`
}
