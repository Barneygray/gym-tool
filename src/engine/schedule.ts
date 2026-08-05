import type { DayId, DayType, Session, Settings, WeekPlan } from '../types'
import { DAYS, dayById } from '../data/days'

/**
 * Default splits per weekly frequency, chosen from the five built-in day
 * templates to spread muscle groups sensibly. Higher frequencies repeat the
 * push/pull/legs core for a second weekly exposure. These only seed the
 * *automatic* plan — a hand-built plan can use any day template, custom ones
 * included.
 */
const SPLITS: Record<number, DayType[]> = {
  2: ['push', 'pull'],
  3: ['push', 'pull', 'legs'],
  4: ['push', 'pull', 'legs', 'shoulders-arms'],
  5: ['push', 'pull', 'legs', 'shoulders-arms', 'chest-back'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
}

/**
 * Which weekdays (Mon=0 … Sun=6) carry a session at a given frequency, picked to
 * leave rest days spaced through the week rather than bunched at the end.
 */
const TRAIN_WEEKDAYS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
}

export const DEFAULT_FREQUENCY = 4

export function clampFrequency(frequency: number): number {
  return Math.max(2, Math.min(6, Math.round(frequency)))
}

export function defaultSplit(frequency: number): DayType[] {
  return SPLITS[clampFrequency(frequency)]
}

/** Start-of-day epoch for a timestamp (local). */
export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The start of the day `n` days after `dayStart`. Calendar arithmetic, not
 * `+ n * DAY`: on the two days a year the clocks change, a day isn't 24 hours
 * and the fixed-offset version lands an hour either side of midnight.
 */
function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart)
  d.setDate(d.getDate() + n)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Monday=0 … Sunday=6 for a timestamp (local). */
export function mondayIndex(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7
}

/** Start of the Monday of the week containing `ts` (local). */
export function startOfWeek(ts: number): number {
  return addDays(startOfDay(ts), -mondayIndex(ts))
}

/**
 * Where to resume the split rotation: the position just after the most recent
 * session the split actually contains. Sessions outside the split —
 * conditioning, freestyle, a custom day run off-plan — are skipped rather than
 * counted as a miss, so an off-plan session no longer silently resets the
 * rotation to the top of the week.
 *
 * `before` bounds how recent a session may be to count. Callers laying out a
 * week pass that week's Monday: the rotation has to be decided by what happened
 * *before* the week began, or every session logged during it would shuffle the
 * days around it — see `resolveWeekPlan`.
 */
export function rotationStart(history: Session[], split: DayId[], before = Infinity): number {
  const sorted = [...history]
    .filter((s) => s.startedAt < before)
    .sort((a, b) => b.startedAt - a.startedAt)
  for (const session of sorted) {
    const idx = split.indexOf(session.dayType)
    if (idx >= 0) return (idx + 1) % split.length
  }
  return 0
}

export interface PlannedDay {
  /** Start-of-day epoch. */
  date: number
  /** Monday=0 … Sunday=6. */
  weekday: number
  /** null = rest day. Any day template id, built-in or custom. */
  dayType: DayId | null
  isToday: boolean
}

/**
 * The seven-slot Mon→Sun layout a frequency implies: split entries dropped onto
 * that frequency's training weekdays, rest on the others, rotated so the week
 * continues where training left off.
 */
export function autoWeekPlan(frequency: number, rotStart = 0): WeekPlan {
  const freq = clampFrequency(frequency)
  const split = SPLITS[freq]
  const trainDays = new Set(TRAIN_WEEKDAYS[freq])
  const plan: WeekPlan = []
  let rot = rotStart
  for (let wd = 0; wd < 7; wd++) {
    if (trainDays.has(wd)) {
      plan.push(split[rot % split.length])
      rot++
    } else {
      plan.push(null)
    }
  }
  return plan
}

/**
 * A hand-built plan is usable only if it has seven slots and every non-rest slot
 * still names a day template that exists — deleting a custom day shouldn't leave
 * the week pointing at a ghost. Unknown ids fall back to rest rather than
 * discarding the whole plan; an all-rest result means "no plan", so the
 * automatic one takes over.
 */
export function sanitizeWeekPlan(plan: WeekPlan | null | undefined): WeekPlan | null {
  if (!Array.isArray(plan) || plan.length !== 7) return null
  const cleaned = plan.map((id) => (id && dayById.has(id) ? id : null))
  return cleaned.some((id) => id !== null) ? cleaned : null
}

/**
 * The week's layout for these settings: the hand-built plan when there is a
 * valid one, otherwise the frequency-derived automatic plan.
 *
 * The automatic plan is anchored to the Monday of the week containing `now`:
 * only sessions from before that Monday move the rotation on. A week is a
 * layout you train *against*, so it has to hold still while you train it —
 * resuming from the very latest session instead meant finishing Monday's push
 * rotated the whole strip under you, relabelling Monday as pull and pushing
 * push out to Friday, as if the session you'd just logged had never happened.
 */
export function resolveWeekPlan(
  settings: Settings,
  history: Session[],
  now = Date.now(),
): WeekPlan {
  const custom = sanitizeWeekPlan(settings.weekPlan)
  if (custom) return custom
  const freq = clampFrequency(settings.weeklyFrequency ?? DEFAULT_FREQUENCY)
  return autoWeekPlan(freq, rotationStart(history, defaultSplit(freq), startOfWeek(now)))
}

/**
 * A rolling Monday→Sunday plan for the week containing `now`. Pass an explicit
 * `override` (from `resolveWeekPlan`) to lay out a hand-built week; otherwise
 * the frequency and rotation start build the automatic one.
 */
export function weeklyPlan(
  now: number,
  frequency: number,
  rotStart = 0,
  override?: WeekPlan | null,
): PlannedDay[] {
  const slots = override && override.length === 7 ? override : autoWeekPlan(frequency, rotStart)
  const todayStart = startOfDay(now)
  const mondayStart = startOfWeek(now)

  return slots.map((dayType, wd) => {
    const date = addDays(mondayStart, wd)
    return { date, weekday: wd, dayType: dayType ?? null, isToday: date === todayStart }
  })
}

/** The next planned training day at or after today, or null if none remain this week. */
export function nextTrainingDay(plan: PlannedDay[]): PlannedDay | null {
  const todayIdx = plan.findIndex((d) => d.isToday)
  const from = todayIdx < 0 ? 0 : todayIdx
  for (let i = from; i < plan.length; i++) if (plan[i].dayType) return plan[i]
  return null
}

/** Full name of a day template, falling back to its raw id. */
export const dayLabel = (id: DayId): string => DAYS.find((d) => d.id === id)?.name ?? String(id)

const BUILTIN_SHORT: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', 'shoulders-arms': 'Arms', 'chest-back': 'Ch/Bk',
}

/**
 * A name short enough for the seven-across week strip. Built-ins keep their
 * hand-picked abbreviations; a custom day uses its own name, initialled when
 * it's too long to fit.
 */
export function shortDayLabel(id: DayId): string {
  const builtin = BUILTIN_SHORT[String(id)]
  if (builtin) return builtin
  const name = dayById.get(id)?.name ?? String(id)
  if (name.length <= 6) return name
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length > 1) return words.map((w) => w[0].toUpperCase()).join('').slice(0, 4)
  return `${name.slice(0, 5)}…`
}
