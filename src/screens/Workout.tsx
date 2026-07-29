import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type { BodyLog, Session, SetLog, Settings } from '../types'
import { FREESTYLE } from '../types'
import {
  exerciseById, getExercise, isBodyweightLoaded, loadBasisHint, loadBasisTag,
} from '../data/exercises'
import { dayById } from '../data/days'
import { swapOptions } from '../engine/rotation'
import { suggestFor } from '../engine/progression'
import { phaseFor } from '../engine/mesocycle'
import { warmupRamp } from '../engine/warmup'
import { platesPerSide } from '../engine/plates'
import { newPRsInSession } from '../engine/stats'
import { bodyweightAt, latestBodyweight } from '../engine/bodyweight'
import { readinessEffect } from '../engine/readiness'
import { activeProfile } from '../engine/equipment'
import { excludedIds } from '../engine/exclusions'
import { performancesOf } from '../engine/history'
import { groupNames, groupsForMuscles } from '../engine/mobility'
import { saveSession } from '../db/db'
import { pushSession } from '../db/sync'
import { useWakeLock } from '../hooks/useWakeLock'
import { Stepper, formatNum } from '../components/Stepper'
import { RestTimer } from '../components/RestTimer'
import { ExercisePicker } from '../components/ExercisePicker'
import { CooldownSheet } from '../components/CooldownSheet'
import type { CooldownPlan } from '../engine/cooldown'
import { nextPartner } from '../engine/superset'
import { BackIcon, CaretIcon, CloseIcon, LinkIcon, SwapIcon, TrashIcon, TrophyIcon } from '../components/Icons'
import type { ActiveWorkout } from '../App'

const KIND_LABEL = {
  increase: 'Level up', build: 'Beat last time', start: 'First time', deload: 'Deload & rebuild',
} as const

// The guided cool-down runs after the session is already saved, so it has no
// business being in the chunk that has to paint at the start of one.
const CooldownScreen = lazy(() => import('./Cooldown').then((m) => ({ default: m.CooldownScreen })))

interface WorkoutProps {
  active: ActiveWorkout
  setActive: (w: ActiveWorkout | null) => void
  history: Session[]
  settings: Settings
  bodyLog: BodyLog[]
  onFinished: () => Promise<void>
  /** Jump to the Stretch tab, focused on the given groups. */
  onStretch: (groupIds: string[]) => void
}

const dayName = (dayType: string) =>
  dayType === FREESTYLE ? 'Freestyle' : dayById.get(dayType)?.name ?? dayType

export function WorkoutScreen(props: WorkoutProps) {
  // A freestyle session starts with nothing prescribed, and any session can be
  // emptied by dropping its last exercise — both land here.
  if (props.active.exerciseIds.length === 0) return <EmptyWorkout {...props} />
  return <ActiveSession {...props} />
}

/** The station picker shown when a session has no exercises yet. */
function EmptyWorkout({ active, setActive, settings }: WorkoutProps) {
  const add = (id: string) =>
    setActive({ ...active, exerciseIds: [id], currentIndex: 0 })

  return (
    <>
      <div className="workout-header">
        <button className="icon-btn" onClick={() => setActive(null)} aria-label="Leave session">
          <BackIcon />
        </button>
        <div className="wh-title">
          <div className="wh-day">{dayName(active.dayType)}</div>
          <div className="count num">Nothing logged yet</div>
        </div>
        <span style={{ width: 38 }} />
      </div>

      <h1 className="sheet-title">What are you starting with?</h1>
      <p className="screen-sub">
        Pick a lift and go. Add more as you work through the session — nothing here is fixed.
      </p>

      <ExercisePicker existing={[]} excluded={excludedIds(settings)} onPick={add}
        onCancel={() => setActive(null)} />
    </>
  )
}

function ActiveSession({ active, setActive, history, settings, bodyLog, onFinished, onStretch }: WorkoutProps) {
  const [summary, setSummary] = useState<{ session: Session; prs: ReturnType<typeof newPRsInSession> } | null>(null)
  /** The cool-down block chosen on the summary, once it's running. */
  const [cooldown, setCooldown] = useState<CooldownPlan | null>(null)
  // The rest belongs to the session, not to whichever station is on screen: it
  // keeps running while you walk to the next lift, read your history, or add a
  // station. Skipping it, logging the next set or going back to fix one, and
  // finishing the session all stop it.
  const [rest, setRest] = useState<{ startedAt: number; durationSec: number; exerciseId: string } | null>(null)
  /** 'add' appends a station; 'swap' replaces the current one. */
  const [picking, setPicking] = useState<'add' | 'swap' | null>(null)

  // Keep the screen awake while training so the rest timer survives idle time.
  useWakeLock(summary === null)

  const bwAt = useMemo(() => bodyweightAt(bodyLog), [bodyLog])
  const bodyweight = useMemo(() => latestBodyweight(bodyLog), [bodyLog])
  const excluded = useMemo(() => excludedIds(settings), [settings])

  const index = Math.min(active.currentIndex, active.exerciseIds.length - 1)
  const exercise = getExercise(active.exerciseIds[index])
  const phase = useMemo(() => phaseFor(settings.meso, active.startedAt), [settings.meso, active.startedAt])
  const readiness = active.readiness ?? null
  const suggestion = useMemo(
    () => suggestFor(exercise, history, settings, phase, { bwAt, readiness }),
    [exercise, history, settings, phase, bwAt, readiness],
  )
  const loggedSets = active.logged[exercise.id] ?? []

  // Every weight on this screen — target, warm-up ramp, what you type in — is
  // one bell's worth on dumbbell work, which is worth saying rather than
  // leaving to be guessed at from the size of the number.
  const basisTag = loadBasisTag(exercise)
  const basisHint = loadBasisHint(exercise)

  // Superset: the group this exercise belongs to, and the partner to alternate
  // to next (the group member with the fewest logged sets so far).
  const superset = active.supersets?.find((g) => g.includes(exercise.id)) ?? null
  const partnerId = useMemo(
    () => nextPartner(superset, exercise.id, active.logged),
    [superset, exercise.id, active.logged],
  )

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
    setRest({ startedAt: Date.now(), durationSec: exercise.restSec, exerciseId: exercise.id })
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
    const next = index + delta
    if (next >= 0 && next < active.exerciseIds.length) {
      setActive({ ...active, currentIndex: next })
    }
  }

  const goToId = (id: string) => {
    const idx = active.exerciseIds.indexOf(id)
    if (idx >= 0) setActive({ ...active, currentIndex: idx })
  }

  // ── Reshaping the session mid-workout ─────────────────
  // The plan you walked in with rarely survives a busy gym. Adding, swapping,
  // and dropping stations are all available here, not just in the pre-session
  // preview. Anything with sets logged against it is protected: swapping or
  // dropping it would strand that work, so those actions are offered only while
  // the station is still untouched.

  const addExercise = (id: string) => {
    setPicking(null)
    if (active.exerciseIds.includes(id)) {
      goToId(id)
      return
    }
    const ids = [...active.exerciseIds]
    ids.splice(index + 1, 0, id)
    setActive({ ...active, exerciseIds: ids, currentIndex: index + 1 })
  }

  const swapExercise = (id: string) => {
    setPicking(null)
    if (active.exerciseIds.includes(id)) return
    const ids = active.exerciseIds.map((existing, i) => (i === index ? id : existing))
    const { [exercise.id]: _dropped, ...logged } = active.logged
    setActive({
      ...active,
      exerciseIds: ids,
      logged,
      // A swapped-out lift can't stay in a superset pairing that no longer exists.
      supersets: active.supersets?.map((g) => g.filter((gid) => gid !== exercise.id)).filter((g) => g.length > 1),
    })
  }

  const dropExercise = () => {
    const ids = active.exerciseIds.filter((_, i) => i !== index)
    const { [exercise.id]: _dropped, ...logged } = active.logged
    setActive({
      ...active,
      exerciseIds: ids,
      logged,
      currentIndex: Math.max(0, Math.min(index, ids.length - 1)),
      supersets: active.supersets?.map((g) => g.filter((gid) => gid !== exercise.id)).filter((g) => g.length > 1),
    })
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
      ...(active.readiness ? { readiness: active.readiness } : {}),
      profileId: activeProfile(settings).id,
    }
    await saveSession(session)
    void pushSession(session)
    const prs = newPRsInSession(session, [session, ...history], bwAt)
    await onFinished()
    setRest(null)
    setSummary({ session, prs })
  }

  if (cooldown) {
    return (
      <Suspense fallback={<div className="screen-loading">Loading…</div>}>
        <CooldownScreen
          plan={cooldown}
          soundOn={settings.soundOn}
          onLogged={onFinished}
          onDone={() => setActive(null)}
        />
      </Suspense>
    )
  }

  if (summary) {
    return (
      <SummaryView
        summary={summary}
        dayType={active.dayType}
        history={history}
        onDone={() => setActive(null)}
        onStretch={onStretch}
        onCooldown={setCooldown}
      />
    )
  }

  const isLast = index === active.exerciseIds.length - 1
  const untouched = loggedSets.length === 0
  const ready = readinessEffect(readiness)

  return (
    <>
      <div className="workout-header">
        <button className="icon-btn" onClick={() => go(-1)} disabled={index === 0}
          aria-label="Previous exercise">
          <BackIcon />
        </button>
        <div className="wh-title">
          <div className="wh-day">{dayName(active.dayType)}</div>
          <div className="count num">Station {index + 1} of {active.exerciseIds.length}</div>
        </div>
        <button className="btn-small" onClick={finish}>Finish</button>
      </div>

      {/* Where you are in the session, without a sentence about it. */}
      <div className="workout-progress" aria-hidden="true">
        {active.exerciseIds.map((id, i) => (
          <i key={id} className={i < index ? 'done' : i === index ? 'at' : ''} />
        ))}
      </div>

      <h1 className="sheet-title">{exercise.name}</h1>
      <p className="sheet-sub" style={{ marginBottom: 'var(--s4)' }}>{exercise.cue}</p>

      <div className="station-actions">
        <button className="btn-small" onClick={() => setPicking(picking === 'add' ? null : 'add')}>
          + Add exercise
        </button>
        {untouched && (
          <>
            <button className="btn-small" onClick={() => setPicking(picking === 'swap' ? null : 'swap')}>
              <SwapIcon size={14} /> Swap
            </button>
            {active.exerciseIds.length > 1 && (
              <button className="btn-small" onClick={dropExercise}>
                <CloseIcon size={14} /> Skip
              </button>
            )}
          </>
        )}
      </div>

      {picking && (
        <ExercisePicker
          existing={picking === 'swap' ? active.exerciseIds : active.exerciseIds}
          excluded={excluded}
          suggested={picking === 'swap' ? swapOptions(exercise.id, active.exerciseIds, excluded) : []}
          placeholder={picking === 'swap' ? 'Swap for…' : 'Add an exercise…'}
          onPick={picking === 'swap' ? swapExercise : addExercise}
          onCancel={() => setPicking(null)}
        />
      )}

      {superset && (
        <div className="super-banner">
          <LinkIcon size={15} />
          <span>
            Superset · alternate with{' '}
            {superset.filter((id) => id !== exercise.id).map((id) => getExercise(id).name).join(', ')}
          </span>
        </div>
      )}

      {ready && ready.level !== 'normal' && (
        <div className="readiness-banner">Readiness: {ready.label}</div>
      )}

      <div className={`suggestion ${suggestion.kind}`}>
        <div className="kind">{KIND_LABEL[suggestion.kind]}</div>
        <div className="target num">
          {suggestion.kind === 'start'
            ? <>{suggestion.sets} × {suggestion.targetReps}
              <small>find your weight{basisTag && ` · ${basisTag}`}</small></>
            : <>{formatNum(suggestion.weight)} kg × {suggestion.targetReps}
              <small>× {suggestion.sets} sets{basisTag && ` · ${basisTag}`}</small></>}
        </div>
        <div className="why">{suggestion.reason}</div>
        {suggestion.offerSwap && untouched && (
          <button className="btn-small accent" style={{ marginTop: 'var(--s3)' }}
            onClick={() => setPicking('swap')}>
            <SwapIcon size={14} /> Swap to a variation
          </button>
        )}
      </div>

      <ExerciseHistory exerciseId={exercise.id} history={history} />

      {warmups.length > 0 && (
        <div className="card warmup-list">
          <div className="section-label" style={{ margin: '0 0 var(--s1)' }}>
            <span>Warm-up ramp</span>
            {basisTag && <span>{basisTag}</span>}
          </div>
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

      {basisHint && <div className="plates-hint">{basisHint}</div>}

      {plates && plates.length > 0 && (
        <div className="plates-hint num">Per side: {plates.map(formatNum).join(' · ')}</div>
      )}

      {isBodyweightLoaded(exercise) && bodyweight !== null && (
        <div className="plates-hint num">
          + bodyweight {formatNum(bodyweight)} kg = {formatNum(bodyweight + weight)} kg total
        </div>
      )}

      {/* One "RPE" label, five numbers — the word used to be stamped on all
          five buttons, so half of each 60px target was the same three chars. */}
      <div className="rpe-row">
        <span className="label" aria-hidden="true">RPE</span>
        <div className="rpe-picker" role="group" aria-label="Rate of perceived exertion">
          {[6, 7, 8, 9, 10].map((r) => (
            <button key={r} className={rpe === r ? 'on' : ''} aria-pressed={rpe === r}
              aria-label={`RPE ${r}`} onClick={() => setRpe(rpe === r ? undefined : r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {showNote ? (
        <input
          style={{ width: '100%', marginBottom: 'var(--s3)' }}
          placeholder="Note — grip, tempo, tweaks…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      ) : (
        <button className="btn-small" style={{ marginBottom: 'var(--s3)' }} onClick={() => setShowNote(true)}>
          + note
        </button>
      )}

      <button className="btn-primary" onClick={commitSet} disabled={reps <= 0}>
        {editingIndex !== null ? `Update set ${editingIndex + 1}` : `Log set ${loggedSets.length + 1}`}
      </button>
      {editingIndex !== null && (
        <button className="btn-ghost mt-3" onClick={seedInputs}>
          Cancel edit
        </button>
      )}

      {loggedSets.length > 0 && (
        <div className="set-log">
          <div className="section-label">
            <span>Logged</span>
            <span>Tap to edit</span>
          </div>
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

      <div style={{ height: 'var(--s5)' }} />
      {!isLast ? (
        <button className="btn-ghost" onClick={() => go(1)}>
          Next: {getExercise(active.exerciseIds[index + 1]).name}
        </button>
      ) : (
        <button className="btn-ghost" onClick={finish}>Finish workout</button>
      )}

      {/* The docked timer is fixed-position, so the scroll content has to give
          up the room itself — otherwise it lands on top of the set list. */}
      {rest && <div className="rest-spacer" aria-hidden="true" />}

      {rest && (
        <RestTimer
          startedAt={rest.startedAt}
          durationSec={rest.durationSec}
          soundOn={settings.soundOn}
          onDismiss={() => setRest(null)}
          // The superset jump is a "go now" button, so it ends the rest — but
          // it's only on offer while you're still standing at the station the
          // rest came from. Walk anywhere else and the clock just names it.
          partner={rest.exerciseId === exercise.id && partnerId
            ? { label: getExercise(partnerId).name, onGo: () => { setRest(null); goToId(partnerId) } }
            : undefined}
          fromLabel={rest.exerciseId === exercise.id ? undefined : getExercise(rest.exerciseId).name}
        />
      )}
    </>
  )
}

/**
 * The last few sessions on this lift, in full: sets, RPE and the notes you left
 * yourself. The engine's one-line "last time" summary answers *what* you did;
 * standing at the rack deciding whether to take the jump, what you usually want
 * is the session before that, and whether you wrote "left shoulder pinched".
 */
function ExerciseHistory({ exerciseId, history }: { exerciseId: string; history: Session[] }) {
  const [open, setOpen] = useState(false)
  const recent = useMemo(() => performancesOf(exerciseId, history).slice(0, 3), [exerciseId, history])
  if (recent.length === 0) return null

  return (
    <div className="ex-history">
      <button className="ex-history-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <CaretIcon />
        Last {recent.length} session{recent.length > 1 ? 's' : ''}
      </button>
      {open && recent.map((p) => (
        <div className="ex-history-session" key={p.startedAt}>
          <div className="when">{relativeDay(p.startedAt)}</div>
          <div className="sets num">
            {p.sets.map((set, i) => (
              <span key={i} className="hset">
                {formatNum(set.weight)}×{set.reps}
                {set.rpe !== undefined && <em> @{set.rpe}</em>}
              </span>
            ))}
          </div>
          {p.sets.filter((set) => set.note).map((set, i) => (
            <div className="hnote" key={i}>“{set.note}”</div>
          ))}
        </div>
      ))}
    </div>
  )
}

function relativeDay(ts: number): string {
  const days = Math.round((Date.now() - ts) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  return new Date(ts).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

function SummaryView({ summary, dayType, history, onDone, onStretch, onCooldown }: {
  summary: { session: Session; prs: ReturnType<typeof newPRsInSession> }
  dayType: string
  history: Session[]
  onDone: () => void
  onStretch: (groupIds: string[]) => void
  onCooldown: (plan: CooldownPlan) => void
}) {
  const { session, prs } = summary
  // The cool-down asks itself, straight away. Left to a button on a summary
  // screen it is never tapped: by the time you've read your tonnage you're
  // already walking to the door.
  const [picking, setPicking] = useState(true)

  // Warm, finished, phone already in hand — the one moment stretching actually
  // happens. Offer the groups covering what was just trained, stalest first.
  const muscles = [...new Set(
    session.entries.flatMap((e) => {
      const ex = exerciseById.get(e.exerciseId)
      return ex ? [ex.primary, ...ex.secondary] : []
    }),
  )]
  const stretchGroups = groupsForMuscles(muscles, history, Date.now()).slice(0, 2)
  const totalSets = session.entries.reduce((t, e) => t + e.sets.length, 0)
  const tonnage = session.entries.reduce(
    (t, e) => t + e.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0)
  const mins = Math.round(((session.finishedAt ?? session.startedAt) - session.startedAt) / 60000)

  return (
    <>
      <h1 className="screen-title">Session done</h1>
      <p className="screen-sub">{dayName(dayType)} — logged and folded into your next suggestions.</p>

      <div className="summary-stat-row">
        <div className="summary-stat"><div className="v num">{totalSets}</div><div className="k">Sets</div></div>
        <div className="summary-stat"><div className="v num">{formatTonnage(tonnage)}</div><div className="k">Tonnage</div></div>
        <div className="summary-stat"><div className="v num">{mins}′</div><div className="k">Minutes</div></div>
      </div>

      {prs.map((pr) => {
        const tag = loadBasisTag(getExercise(pr.exerciseId))
        return (
          <div className="pr-flash" key={`${pr.exerciseId}-${pr.kind}`}>
            <span className="pr-medal" aria-hidden="true"><TrophyIcon size={26} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="pr-kind">{pr.kind === 'weight' ? 'New weight PR' : 'New est. 1RM PR'}</div>
              <div className="pr-line">
                {getExercise(pr.exerciseId).name} — <span className="num">{formatNum(pr.weight)} kg × {pr.reps}</span>
                {tag && <span> · {tag}</span>}
              </div>
            </div>
          </div>
        )
      })}
      {prs.length === 0 && (
        <p className="sub" style={{ maxWidth: '38ch' }}>
          No PRs today — showing up is the PR. The engine has adjusted your next targets.
        </p>
      )}

      {!picking && (
        <button className="btn-ghost mt-4" onClick={() => setPicking(true)}>
          Cool down — 5 or 10 minutes
        </button>
      )}

      {stretchGroups.length > 0 && (
        <button className="btn-ghost stretch-offer mt-3"
          onClick={() => onStretch(stretchGroups)}>
          Stretch it out — {groupNames(stretchGroups).join(' · ')}
        </button>
      )}

      <div style={{ height: 'var(--s5)' }} />
      <button className="btn-primary" onClick={onDone}>Done</button>

      {picking && (
        <CooldownSheet
          muscles={muscles}
          history={history}
          onSkip={() => setPicking(false)}
          onStart={(plan) => {
            setPicking(false)
            onCooldown(plan)
          }}
        />
      )}
    </>
  )
}

function formatTonnage(kg: number): string {
  return kg >= 10000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}`
}
