import type { DayId, Muscle, Session, WeekPlan } from '../types'
import { DAYS, dayById } from '../data/days'
import { startOfDay } from './schedule'
import { recoveryByMuscle } from './stats'
import { MUSCLE_TARGETS, underVolumeMuscles, weeklySetsByMuscle } from './volume'
import { staleGroups } from './mobility'

export interface DayRecommendation {
  dayType: DayId
  dayName: string
  headline: string
  reason: string
  /** Muscles gone stale (≥ 7 days, or never trained once you have history). */
  overdue: Muscle[]
  /** Muscles trained this week but below their minimum effective volume. */
  underVolume: Muscle[]
  /** Stretch groups gone stale for muscles actually being trained. */
  staleMobility: string[]
  /** True when this is the day the week's plan schedules for today. */
  fromPlan: boolean
  /**
   * Set when the plan and recovery genuinely disagree — the planned day's
   * muscles were hit hard very recently. Names an alternative worth swapping to.
   */
  conflict: { withDay: DayId; withDayName: string; note: string } | null
}

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'chest', back: 'back', shoulders: 'delts', biceps: 'biceps', triceps: 'triceps',
  quads: 'quads', hamstrings: 'hams', glutes: 'glutes', calves: 'calves', core: 'core',
}

const CAP = 14
/** Under this many days since a day's muscles were worked, they're not recovered. */
const SORE = 1.5

export interface CoachOptions {
  /** The week's Mon→Sun layout, so the coach and the plan can't contradict. */
  plan?: WeekPlan | null
  /** Monday=0 … Sunday=6 for `now`. */
  weekday?: number
}

/**
 * Pick what to train next.
 *
 * The plan comes first when it has a session for today: it's the trainee's own
 * decision, and a coach card naming a different day from the week strip
 * directly beneath it on the same screen is just noise. Freshness doesn't stop
 * mattering — it becomes the check on the plan, raising a `conflict` when
 * today's planned muscles were hammered yesterday instead of quietly going
 * along with it.
 *
 * With no plan, on a planned rest day, or once today's planned session is
 * already logged, it falls back to the freshest day — now nudged by weekly
 * volume, so a day whose muscles still owe the week sets wins a near-tie
 * against one that's already well fed.
 */
export function recommendDay(
  history: Session[],
  now: number,
  options: CoachOptions = {},
): DayRecommendation {
  const recovery = recoveryByMuscle(history, now)
  const daysFor = (m: Muscle) => recovery.get(m) ?? Infinity
  const fresh = history.length === 0

  const overdue = fresh
    ? []
    : ([...recovery.entries()] as [Muscle, number][])
        .filter(([, d]) => d >= 7)
        .sort((a, b) => b[1] - a[1])
        .map(([m]) => m)
  const underVolume = fresh ? [] : underVolumeMuscles(history, now)
  const staleMobility = fresh ? [] : staleGroups(history, now)

  const restedness = (day: { muscles: Muscle[] }) =>
    day.muscles.reduce((sum, m) => sum + Math.min(daysFor(m), CAP), 0) / day.muscles.length
  const short = deficit(history, now)

  const phrase = (m: Muscle) => {
    const d = daysFor(m)
    return d === Infinity ? `${MUSCLE_LABEL[m]} not trained yet` : `${MUSCLE_LABEL[m]} rested ${Math.floor(d)}d`
  }
  const topTwo = (muscles: Muscle[]) =>
    capitalize([...muscles].sort((a, b) => daysFor(b) - daysFor(a)).slice(0, 2).map(phrase).join(', '))

  // ── What the plan says, when it has something for today ──
  const hasPlan = options.plan != null && options.weekday !== undefined
  const plannedId = hasPlan ? options.plan![options.weekday!] : null
  const planned = plannedId ? dayById.get(plannedId) : undefined
  // Today's plan, once you've actually done it, is history rather than advice.
  const today = startOfDay(now)
  const planDone =
    planned !== undefined &&
    history.some((s) => s.dayType === planned.id && startOfDay(s.startedAt) === today)

  if (planned && !planDone) {
    const rested = restedness(planned)
    let conflict: DayRecommendation['conflict'] = null
    if (!fresh && rested < SORE) {
      const alt = bestBy(DAYS.filter((d) => d.id !== planned.id), restedness, short)
      if (alt && restedness(alt) > rested + 1) {
        conflict = {
          withDay: alt.id,
          withDayName: alt.name,
          note: `${planned.name} is planned, but ${topTwo(planned.muscles).toLowerCase()} — ${alt.name} is fresher if you'd rather swap.`,
        }
      }
    }
    return {
      dayType: planned.id,
      dayName: planned.name,
      headline: `${planned.name} — today's plan`,
      reason: fresh ? 'First session of the plan — a clean place to start.' : topTwo(planned.muscles),
      overdue,
      underVolume,
      staleMobility,
      fromPlan: true,
      conflict,
    }
  }

  // ── Nothing planned for today, or it's already done: freshest day, nudged by volume ──
  const best = bestBy(DAYS, restedness, short) ?? DAYS[0]

  return {
    dayType: best.id,
    dayName: best.name,
    headline: fresh
      ? 'Start here'
      : planDone
        ? `${planned.name} done — ${best.name} if you're training again`
        : hasPlan
          ? `Rest day — ${best.name} if you're training anyway`
          : `${best.name} is your freshest option`,
    reason: fresh ? 'Everything’s fresh — a clean place to start.' : topTwo(best.muscles),
    overdue,
    underVolume,
    staleMobility,
    fromPlan: false,
    conflict: null,
  }
}

/**
 * Mean shortfall against minimum effective volume across a day's muscles, 0–1.
 * The coach already computed this to *report* under-dosed muscles; using it to
 * break ties makes it actually steer the recommendation.
 */
function deficit(history: Session[], now: number): (muscles: Muscle[]) => number {
  const week = weeklySetsByMuscle(history, now - 7 * 86_400_000, now + 1)
  return (muscles) =>
    muscles.reduce((sum, m) => {
      const { mev } = MUSCLE_TARGETS[m]
      return sum + Math.max(0, (mev - (week.get(m) ?? 0)) / mev)
    }, 0) / muscles.length
}

/**
 * Highest restedness wins outright; days within a day of each other are near
 * enough to tie, and the volume shortfall breaks it. Ties beyond that break
 * toward the earlier day template, as before.
 */
function bestBy<T extends { id: DayId; muscles: Muscle[] }>(
  days: T[],
  rested: (d: T) => number,
  short: (muscles: Muscle[]) => number,
): T | undefined {
  let best: T | undefined
  let bestRest = -Infinity
  let bestShort = -Infinity
  for (const day of days) {
    const r = rested(day)
    const s = short(day.muscles)
    if (best === undefined || r > bestRest + 1 || (r > bestRest - 1 && s > bestShort)) {
      best = day
      bestRest = r
      bestShort = s
    }
  }
  return best
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export { MUSCLE_LABEL as coachMuscleLabel }
