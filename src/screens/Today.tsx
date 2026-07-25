import { useMemo, useState } from 'react'
import type { BodyLog, DayId, Muscle, ReadinessLevel, Session, Settings } from '../types'
import { FREESTYLE } from '../types'
import { DAYS, dayById } from '../data/days'
import { EXERCISES, getExercise } from '../data/exercises'
import { generateWorkout, swapOptions } from '../engine/rotation'
import { suggestFor } from '../engine/progression'
import { recommendDay } from '../engine/coach'
import { phaseFor } from '../engine/mesocycle'
import { buildSupersets } from '../engine/superset'
import { mondayIndex, resolveWeekPlan, shortDayLabel, weeklyPlan } from '../engine/schedule'
import { READINESS_LEVELS, readinessEffect, readinessLabel } from '../engine/readiness'
import { bodyweightAt } from '../engine/bodyweight'
import { lastSessionOf } from '../engine/history'
import { recoveryByMuscle, daysSince } from '../engine/stats'
import { ChevronIcon, CloseIcon, LinkIcon, SwapIcon } from '../components/Icons'
import { formatNum } from '../components/Stepper'
import type { ActiveWorkout } from '../App'

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Delts', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hams', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}

const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface TodayProps {
  history: Session[]
  settings: Settings
  bodyLog: BodyLog[]
  startWorkout: (w: ActiveWorkout) => void
}

export function TodayScreen({ history, settings, bodyLog, startWorkout }: TodayProps) {
  const [previewDay, setPreviewDay] = useState<DayId | null>(null)
  const now = Date.now()
  const recovery = useMemo(() => recoveryByMuscle(history, now), [history, now])
  const rec = useMemo(() => recommendDay(history, now), [history, now])
  const phase = useMemo(() => phaseFor(settings.meso, now), [settings.meso, now])
  const bwAt = useMemo(() => bodyweightAt(bodyLog), [bodyLog])
  // The week's layout: a hand-built plan when there is one — custom days
  // included — otherwise the frequency-derived automatic one.
  const slots = useMemo(() => resolveWeekPlan(settings, history), [settings, history])
  const plan = useMemo(() => weeklyPlan(now, 4, 0, slots), [now, slots])
  const planned = plan.filter((d) => d.dayType).length
  const custom = settings.weekPlan != null
  const todayIdx = mondayIndex(now)

  return (
    <>
      <h1 className="screen-title">Train</h1>
      <p className="screen-sub">Pick today’s session — Forge remembers where you left off.</p>

      {phase && (
        <div className={`block-banner ${phase.phase}`}>
          <div className="block-label">{phase.label}</div>
          <div className="block-note">{phase.note}</div>
        </div>
      )}

      <button className="coach-card" onClick={() => setPreviewDay(rec.dayType)}>
        <div className="coach-kind">Train next</div>
        <div className="coach-day">{rec.dayName}</div>
        <div className="coach-why">{rec.reason}</div>
        {rec.overdue.length > 0 && (
          <div className="coach-overdue">
            Overdue: {rec.overdue.slice(0, 4).map((m) => MUSCLE_LABEL[m]).join(' · ')}
          </div>
        )}
        {rec.underVolume.length > 0 && (
          <div className="coach-overdue">
            Low volume this week: {rec.underVolume.slice(0, 4).map((m) => MUSCLE_LABEL[m]).join(' · ')}
          </div>
        )}
      </button>

      <div className="section-label">
        This week · {planned}× {custom ? 'your plan' : 'auto plan'}
      </div>
      <div className="week-plan">
        {plan.map((d) => (
          <button
            key={d.weekday}
            className={`plan-day${d.isToday ? ' today' : ''}${d.dayType ? '' : ' rest'}`}
            disabled={!d.dayType}
            onClick={() => d.dayType && setPreviewDay(d.dayType)}
          >
            <span className="wd">{WEEKDAY_LETTER[d.weekday]}</span>
            <span className="pd-name">{d.dayType ? shortDayLabel(d.dayType) : 'Rest'}</span>
            {d.weekday === todayIdx && <span className="pd-today">Today</span>}
          </button>
        ))}
      </div>

      <div className="section-label">Muscle freshness</div>
      <div className="recovery">
        {[...recovery.entries()].map(([muscle, days]) => (
          <div className="pill" key={muscle}>
            <span
              className="dot"
              style={{ background: freshnessColor(days) }}
            />
            <span>{MUSCLE_LABEL[muscle]}</span>
            <span className="num" style={{ color: 'var(--text-faint)' }}>
              {days === Infinity ? '—' : `${Math.floor(days)}d`}
            </span>
          </div>
        ))}
      </div>

      <div className="section-label">Gym days</div>
      {DAYS.map((day) => {
        const last = lastSessionOf(day.id, history)
        const since = daysSince(last?.startedAt, now)
        return (
          <button key={day.id} className="day-card" onClick={() => setPreviewDay(day.id)}>
            <div>
              <h3>{day.name}</h3>
              <div className={`meta${since !== null && since >= 5 ? ' fresh' : ''}`}>
                {since === null ? 'Never trained — clean slate'
                  : since === 0 ? 'Trained today'
                  : since === 1 ? 'Yesterday'
                  : `${since} days ago`}
              </div>
            </div>
            <span className="chev"><ChevronIcon /></span>
          </button>
        )
      })}

      <button
        className="day-card freestyle"
        onClick={() =>
          startWorkout({
            dayType: FREESTYLE,
            startedAt: Date.now(),
            exerciseIds: [],
            logged: {},
            currentIndex: 0,
          })
        }
      >
        <div>
          <h3>Freestyle session</h3>
          <div className="meta">No template — pick lifts as you go</div>
        </div>
        <span className="chev"><ChevronIcon /></span>
      </button>

      {previewDay && (
        <WorkoutPreview
          dayType={previewDay}
          history={history}
          settings={settings}
          phase={phase}
          bwAt={bwAt}
          onClose={() => setPreviewDay(null)}
          onStart={(exerciseIds, supersets, readiness) => {
            startWorkout({
              dayType: previewDay,
              startedAt: Date.now(),
              exerciseIds,
              logged: {},
              currentIndex: 0,
              supersets,
              readiness,
            })
            setPreviewDay(null)
          }}
        />
      )}
    </>
  )
}

function freshnessColor(days: number): string {
  if (days === Infinity) return 'var(--text-faint)'
  if (days < 1.5) return 'var(--ember)' // freshly hammered
  if (days < 3) return '#eab308'
  return 'var(--green)' // recovered, ready to hit
}

function WorkoutPreview({ dayType, history, settings, phase, bwAt, onClose, onStart }: {
  dayType: DayId
  history: Session[]
  settings: Settings
  phase: ReturnType<typeof phaseFor>
  bwAt: ReturnType<typeof bodyweightAt>
  onClose: () => void
  onStart: (exerciseIds: string[], supersets: string[][], readiness: ReadinessLevel | null) => void
}) {
  const day = dayById.get(dayType)!
  const [exerciseIds, setExerciseIds] = useState<string[]>(() => generateWorkout(day, history))
  // Ids "joined" to the exercise directly above them, forming a superset.
  const [joined, setJoined] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const askReadiness = settings.readinessCheck === true
  const [readiness, setReadiness] = useState<ReadinessLevel | null>(askReadiness ? 'normal' : null)
  const readyNote = readinessEffect(readiness)?.note ?? ''

  const swap = (index: number) => {
    const options = swapOptions(exerciseIds[index], exerciseIds)
    if (options.length === 0) return
    // Cycle through the like-exercise list on repeated taps.
    setExerciseIds((ids) => {
      const next = [...ids]
      next[index] = options[0]
      return next
    })
  }

  const removeAt = (index: number) => {
    const removed = exerciseIds[index]
    setExerciseIds((ids) => ids.filter((_, i) => i !== index))
    setJoined((j) => {
      const next = new Set(j)
      next.delete(removed)
      // The row that shifts up into this slot can no longer be joined to it.
      if (exerciseIds[index + 1]) next.delete(exerciseIds[index + 1])
      return next
    })
  }

  const toggleJoin = (id: string) => {
    setJoined((j) => {
      const next = new Set(j)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addExercise = (id: string) => {
    setExerciseIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
    setAdding(false)
  }

  const supersets = buildSupersets(exerciseIds, joined)
  const groupIndexOf = (id: string) => supersets.findIndex((g) => g.includes(id))

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <h2 className="screen-title" style={{ fontSize: 24 }}>{day.name}</h2>
        <p className="screen-sub" style={{ marginBottom: 8 }}>
          Rotated for fresh stimulus — swap, add, drop, or link two into a superset.
        </p>

        {askReadiness && (
          <div className="readiness">
            <div className="section-label" style={{ marginTop: 0 }}>How are you feeling?</div>
            <div className="seg">
              {READINESS_LEVELS.map((level) => (
                <button key={level} className={readiness === level ? 'on' : ''}
                  onClick={() => setReadiness(level)}>
                  {readinessLabel(level)}
                </button>
              ))}
            </div>
            {readyNote && <div className="readiness-note">{readyNote}</div>}
          </div>
        )}

        {exerciseIds.map((id, i) => {
          const exercise = getExercise(id)
          const suggestion = suggestFor(exercise, history, settings, phase, { bwAt, readiness })
          const gi = groupIndexOf(id)
          const linkedUp = joined.has(id) && gi >= 0
          return (
            <div key={id}>
              {i > 0 && (
                <button
                  className={`link-row${linkedUp ? ' on' : ''}`}
                  onClick={() => toggleJoin(id)}
                  aria-label={linkedUp ? 'Unlink superset' : `Superset with ${getExercise(exerciseIds[i - 1]).name}`}
                >
                  <LinkIcon size={15} />
                  {linkedUp ? 'Superset' : 'Superset with above'}
                </button>
              )}
              <div className={`preview-row${gi >= 0 ? ' in-super' : ''}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="name">
                    {gi >= 0 && <span className="super-tag">SS{gi + 1}</span>}
                    {exercise.name}
                  </div>
                  <div className="detail num">
                    {suggestion.kind === 'start'
                      ? `${suggestion.sets} × ${suggestion.targetReps} · find your weight`
                      : `${suggestion.sets} × ${suggestion.targetReps} @ ${formatNum(suggestion.weight)} kg`}
                  </div>
                </div>
                <span className="muscle-tag">{MUSCLE_LABEL[exercise.primary]}</span>
                <button className="swap-btn" onClick={() => swap(i)} aria-label={`Swap ${exercise.name}`}>
                  <SwapIcon />
                </button>
                {exerciseIds.length > 1 && (
                  <button className="swap-btn" onClick={() => removeAt(i)} aria-label={`Remove ${exercise.name}`}>
                    <CloseIcon size={17} />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {adding ? (
          <AddExercisePicker
            existing={exerciseIds}
            onPick={addExercise}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
            + Add exercise
          </button>
        )}

        <div style={{ height: 14 }} />
        <button className="btn-primary" onClick={() => onStart(exerciseIds, supersets, readiness)}
          disabled={exerciseIds.length === 0}
          style={{ opacity: exerciseIds.length === 0 ? 0.4 : 1 }}>
          Start {day.name}
        </button>
      </div>
    </>
  )
}

function AddExercisePicker({ existing, onPick, onCancel }: {
  existing: string[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const taken = new Set(existing)
  const q = query.trim().toLowerCase()
  const options = EXERCISES
    .filter((e) => !taken.has(e.id) && (q === '' || e.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="add-picker">
      <div className="add-picker-head">
        <input autoFocus placeholder="Search exercises…" value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-small" onClick={onCancel}>Done</button>
      </div>
      <div className="add-picker-list">
        {options.length === 0 && <div className="add-picker-empty">No matches.</div>}
        {options.map((e) => (
          <button key={e.id} className="add-picker-row" onClick={() => onPick(e.id)}>
            <span className="name">{e.name}</span>
            <span className="muscle-tag">{MUSCLE_LABEL[e.primary]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
