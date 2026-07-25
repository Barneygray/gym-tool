import type { DayType, Session } from '../types'
import { DAYS } from '../data/days'

const DAY = 86_400_000

/**
 * Default splits per weekly frequency, chosen from the five built-in day
 * templates to spread muscle groups sensibly. Higher frequencies repeat the
 * push/pull/legs core for a second weekly exposure.
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
function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Monday=0 … Sunday=6 for a timestamp (local). */
export function mondayIndex(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7
}

/**
 * Where to resume the split rotation: the position just after the split entry
 * matching the most recent session, so the plan continues the rotation instead
 * of restarting it. Falls back to 0 when nothing matches.
 */
export function rotationStart(history: Session[], split: DayType[]): number {
  const last = [...history]
    .filter((s) => s.dayType !== 'conditioning')
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  if (!last) return 0
  const idx = split.indexOf(last.dayType as DayType)
  return idx < 0 ? 0 : (idx + 1) % split.length
}

export interface PlannedDay {
  /** Start-of-day epoch. */
  date: number
  /** Monday=0 … Sunday=6. */
  weekday: number
  /** null = rest day. */
  dayType: DayType | null
  isToday: boolean
}

/**
 * A rolling Monday→Sunday plan for the week containing `now`, assigning day
 * templates to the frequency's training weekdays (rest on the others) and
 * rotating through the split starting at `rotStart`.
 */
export function weeklyPlan(now: number, frequency: number, rotStart = 0): PlannedDay[] {
  const freq = clampFrequency(frequency)
  const split = SPLITS[freq]
  const trainDays = new Set(TRAIN_WEEKDAYS[freq])
  const todayStart = startOfDay(now)
  const todayWeekday = mondayIndex(now)
  const mondayStart = todayStart - todayWeekday * DAY

  const plan: PlannedDay[] = []
  let rot = rotStart
  for (let wd = 0; wd < 7; wd++) {
    const date = mondayStart + wd * DAY
    const training = trainDays.has(wd)
    plan.push({
      date,
      weekday: wd,
      dayType: training ? split[rot % split.length] : null,
      isToday: date === todayStart,
    })
    if (training) rot++
  }
  return plan
}

/** The next planned training day at or after today, or null if none remain this week. */
export function nextTrainingDay(plan: PlannedDay[]): PlannedDay | null {
  const todayIdx = plan.findIndex((d) => d.isToday)
  const from = todayIdx < 0 ? 0 : todayIdx
  for (let i = from; i < plan.length; i++) if (plan[i].dayType) return plan[i]
  return null
}

export const dayLabel = (id: DayType): string => DAYS.find((d) => d.id === id)?.name ?? id
