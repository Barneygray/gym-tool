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
import { dayLabel, mondayIndex, resolveWeekPlan, shortDayLabel, weeklyPlan } from '../engine/schedule'
import { READINESS_LEVELS, readinessEffect, readinessLabel } from '../engine/readiness'
import { bodyweightAt } from '../engine/bodyweight'
import { activeProfile, profilesOf } from '../engine/equipment'
import { groupNames } from '../engine/mobility'
import { saveSettings } from '../db/db'
import { pushSettings } from '../db/sync'
import { lastSessionOf } from '../engine/history'
import { recoveryByMuscle, daysSince } from '../engine/stats'
import { AlertIcon, ChevronIcon, CloseIcon, LinkIcon, SwapIcon } from '../components/Icons'
import { formatNum } from '../components/Stepper'
import type { ActiveWorkout } from '../App'

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Delts', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hams', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}

const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const fmtToday = (now: number) =>
  new Date(now).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })

interface TodayProps {
  history: Session[]
  settings: Settings
  bodyLog: BodyLog[]
  startWorkout: (w: ActiveWorkout) => void
  onChanged: () => Promise<void>
}

export function TodayScreen({ history, settings, bodyLog, startWorkout, onChanged }: TodayProps) {
  const [previewDay, setPreviewDay] = useState<DayId | null>(null)
  const now = Date.now()
  const recovery = useMemo(() => recoveryByMuscle(history, now), [history, now])
  const phase = useMemo(() => phaseFor(settings.meso, now), [settings.meso, now])
  const bwAt = useMemo(() => bodyweightAt(bodyLog), [bodyLog])
  // The week's layout: a hand-built plan when there is one — custom days
  // included — otherwise the frequency-derived automatic one.
  const slots = useMemo(() => resolveWeekPlan(settings, history), [settings, history])
  // The coach reads the same plan, so the card and the strip can't disagree.
  const rec = useMemo(
    () => recommendDay(history, now, { plan: slots, weekday: mondayIndex(now) }),
    [history, now, slots],
  )
  const plan = useMemo(() => weeklyPlan(now, 4, 0, slots), [now, slots])
  const planned = plan.filter((d) => d.dayType).length
  const custom = settings.weekPlan != null
  const todayIdx = mondayIndex(now)

  return (
    <>
      {/* No "Train" heading and no sentence explaining the screen: the tab bar
          already names it, and the recommendation below answers it. What earns
          the space at the top is the date and which block you're in. */}
      <div className="page-head">
        <span className="micro">{fmtToday(now)}</span>
        {phase && <span className={`micro phase ${phase.phase}`}>{phase.label}</span>}
      </div>

      {phase && <div className={`block-banner ${phase.phase}`}>
        <div className="block-note">{phase.note}</div>
      </div>}

      <button className="coach-card" onClick={() => setPreviewDay(rec.dayType)}>
        <div className="coach-kind">{rec.fromPlan ? 'Today’s plan' : 'Train next'}</div>
        <div className="coach-day">{rec.dayName}</div>
        <div className="coach-why">{rec.reason}</div>
        {rec.conflict && (
          <div className="coach-conflict">
            <AlertIcon />
            <span>{rec.conflict.note}</span>
          </div>
        )}
        {(rec.overdue.length > 0 || rec.underVolume.length > 0 || rec.staleMobility.length > 0) && (
          <dl className="coach-notes">
            {rec.overdue.length > 0 && (
              <div className="coach-note">
                <dt>Overdue</dt>
                <dd>{rec.overdue.slice(0, 4).map((m) => MUSCLE_LABEL[m]).join(' · ')}</dd>
              </div>
            )}
            {rec.underVolume.length > 0 && (
              <div className="coach-note">
                <dt>Low volume</dt>
                <dd>{rec.underVolume.slice(0, 4).map((m) => MUSCLE_LABEL[m]).join(' · ')}</dd>
              </div>
            )}
            {rec.staleMobility.length > 0 && (
              <div className="coach-note">
                <dt>Unstretched</dt>
                <dd>{groupNames(rec.staleMobility.slice(0, 2)).join(' · ')}</dd>
              </div>
            )}
          </dl>
        )}
      </button>

      <GymSwitcher settings={settings} onChanged={onChanged} />

      <div className="section-label">
        <span>This week</span>
        <span>{planned}× · {custom ? 'your plan' : 'auto plan'}</span>
      </div>
      <div className="week-plan">
        {plan.map((d) => (
          <button
            key={d.weekday}
            className={`plan-day${d.isToday ? ' today' : ''}${d.dayType ? '' : ' rest'}`}
            disabled={!d.dayType}
            aria-current={d.isToday ? 'date' : undefined}
            aria-label={`${WEEKDAY_FULL[d.weekday]}${d.isToday ? ' (today)' : ''}: ${d.dayType ? dayLabel(d.dayType) : 'rest day'}`}
            onClick={() => d.dayType && setPreviewDay(d.dayType)}
          >
            <span className="wd" aria-hidden="true">{WEEKDAY_LETTER[d.weekday]}</span>
            <span className="pd-name">{d.dayType ? shortDayLabel(d.dayType) : 'Rest'}</span>
            {/* A dot, not a "TODAY" caption — the caption made this one cell a
                line taller than the six beside it. */}
            {d.weekday === todayIdx && <span className="pd-today" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="section-label">
        <span>Muscle freshness</span>
        <span>Days rested</span>
      </div>
      <div className="recovery">
        {[...recovery.entries()].map(([muscle, days]) => (
          <div className="pill" key={muscle}>
            <span className="dot" style={{ background: freshnessColor(days) }} />
            <span>{MUSCLE_LABEL[muscle]}</span>
            <span className="num">
              {days === Infinity ? '—' : Math.floor(days)}
              {days !== Infinity && <i>d</i>}
            </span>
          </div>
        ))}
      </div>

      <div className="section-label">
        <span>Gym days</span>
        <span>Last</span>
      </div>
      {DAYS.map((day) => {
        const last = lastSessionOf(day.id, history)
        const since = daysSince(last?.startedAt, now)
        return (
          <button key={day.id} className="day-card" onClick={() => setPreviewDay(day.id)}>
            {/* The elapsed figure is the column you actually scan, so it leads
                the row rather than sitting inside a prose meta line. */}
            <span className="rowkey">
              {since === null ? '—' : since === 0 ? 'Today' : `${since}d`}
            </span>
            <div>
              <h3>{day.name}</h3>
              {/* The key column already gives the elapsed figure, so a second
                  line restating it as prose is noise. It only earns the space
                  when it has something the number can't say. */}
              {since === null ? (
                <div className="meta">Never trained</div>
              ) : since >= 5 ? (
                <div className="meta fresh">Fully recovered</div>
              ) : null}
            </div>
            <span className="chev"><ChevronIcon size={16} /></span>
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
        <span className="rowkey">Open</span>
        <div>
          <h3>Freestyle</h3>
          <div className="meta">No template — pick lifts as you go</div>
        </div>
        <span className="chev"><ChevronIcon size={16} /></span>
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


/**
 * Only appears once there's more than one gym. Switching re-points plate math,
 * warm-up rungs and every rounded suggestion at the rack you're actually
 * standing in front of — so it belongs one tap from starting a session, not
 * buried three screens deep in Setup.
 */
function GymSwitcher({ settings, onChanged }: { settings: Settings; onChanged: () => Promise<void> }) {
  const profiles = profilesOf(settings)
  if (profiles.length < 2) return null
  const active = activeProfile(settings)

  const switchTo = async (id: string) => {
    const target = profiles.find((p) => p.id === id)
    if (!target || target.id === active.id) return
    const next = await saveSettings({
      ...settings,
      activeProfileId: target.id,
      barWeightKg: target.barWeightKg,
      platesKg: target.platesKg,
    })
    void pushSettings(next)
    await onChanged()
  }

  return (
    <div className="gym-switch seg" role="radiogroup" aria-label="Training at">
      {profiles.map((p) => (
        <button key={p.id} role="radio" aria-checked={p.id === active.id}
          className={p.id === active.id ? 'on' : ''} onClick={() => switchTo(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  )
}

/**
 * A traffic light on readiness, not on the accent: red is "just hammered,
 * leave it", green is "recovered, hit it". Ember used to stand for freshly
 * trained, which put the app's accent colour on the muscles you should
 * *avoid* — and left nothing distinguishing it from every other accent.
 */
function freshnessColor(days: number): string {
  if (days === Infinity) return 'var(--text-faint)'
  if (days < 1.5) return 'var(--bad)'
  if (days < 3) return 'var(--warn)'
  return 'var(--green)'
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
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">{day.name}</h2>
            <p className="sheet-sub">
              Rotated for fresh stimulus — swap, add, drop, or link two into a superset.
            </p>
          </div>
          <button className="icon-btn sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </div>

        {askReadiness && (
          <div className="readiness" style={{ marginTop: 'var(--s4)' }}>
            <div className="section-label" style={{ marginTop: 0 }}>How are you feeling?</div>
            <div className="seg" role="radiogroup" aria-label="How are you feeling?">
              {READINESS_LEVELS.map((level) => (
                <button key={level} role="radio" aria-checked={readiness === level}
                  className={readiness === level ? 'on' : ''}
                  onClick={() => setReadiness(level)}>
                  {readinessLabel(level)}
                </button>
              ))}
            </div>
            {readyNote && <div className="readiness-note">{readyNote}</div>}
          </div>
        )}

        <div className="exercise-list">
          {exerciseIds.map((id, i) => {
            const exercise = getExercise(id)
            const suggestion = suggestFor(exercise, history, settings, phase, { bwAt, readiness })
            const gi = groupIndexOf(id)
            const linkedUp = joined.has(id) && gi >= 0
            return (
              <div key={id}>
                {/* The link control sits *on* the hairline between two rows.
                    It used to be a full "Superset with above" caption under
                    every single row, which doubled the list's height. */}
                {i > 0 && (
                  <button
                    className={`link-row${linkedUp ? ' on' : ''}`}
                    onClick={() => toggleJoin(id)}
                    aria-label={linkedUp ? 'Unlink superset' : `Superset with ${getExercise(exerciseIds[i - 1]).name}`}
                  >
                    <LinkIcon size={14} />
                    {linkedUp && <span>Superset</span>}
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
                  <div className="row-actions">
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
              </div>
            )
          })}
        </div>

        {adding ? (
          <AddExercisePicker
            existing={exerciseIds}
            onPick={addExercise}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className="btn-ghost mt-3" onClick={() => setAdding(true)}>
            + Add exercise
          </button>
        )}

        <div style={{ height: 'var(--s4)' }} />
        <button className="btn-primary" onClick={() => onStart(exerciseIds, supersets, readiness)}
          disabled={exerciseIds.length === 0}>
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
