import type { DayType, Muscle, Session } from '../types'
import { DAYS } from '../data/days'
import { recoveryByMuscle } from './stats'
import { underVolumeMuscles } from './volume'

export interface DayRecommendation {
  dayType: DayType
  dayName: string
  headline: string
  reason: string
  /** Muscles gone stale (≥ 7 days, or never trained once you have history). */
  overdue: Muscle[]
  /** Muscles trained this week but below their minimum effective volume. */
  underVolume: Muscle[]
}

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'chest', back: 'back', shoulders: 'delts', biceps: 'biceps', triceps: 'triceps',
  quads: 'quads', hamstrings: 'hams', glutes: 'glutes', calves: 'calves', core: 'core',
}

const CAP = 14

/**
 * Pick the gym day whose muscles are most rested (highest average days-since-
 * trained), turning the freshness the home screen already computes into an
 * actual "train this next" call. Ties break toward the earlier day template.
 */
export function recommendDay(history: Session[], now: number): DayRecommendation {
  const recovery = recoveryByMuscle(history, now)
  const daysFor = (m: Muscle) => recovery.get(m) ?? Infinity

  let best = DAYS[0]
  let bestScore = -1
  for (const day of DAYS) {
    const score =
      day.muscles.reduce((sum, m) => sum + Math.min(daysFor(m), CAP), 0) / day.muscles.length
    if (score > bestScore) {
      bestScore = score
      best = day
    }
  }

  const fresh = history.length === 0
  const ranked = [...best.muscles].sort((a, b) => daysFor(b) - daysFor(a))
  const phrase = (m: Muscle) => {
    const d = daysFor(m)
    return d === Infinity ? `${MUSCLE_LABEL[m]} not trained yet` : `${MUSCLE_LABEL[m]} rested ${Math.floor(d)}d`
  }
  const reason = fresh
    ? 'Everything’s fresh — a clean place to start.'
    : capitalize(ranked.slice(0, 2).map(phrase).join(', '))

  const overdue = fresh
    ? []
    : ([...recovery.entries()] as [Muscle, number][])
        .filter(([, d]) => d >= 7)
        .sort((a, b) => b[1] - a[1])
        .map(([m]) => m)

  return {
    dayType: best.id,
    dayName: best.name,
    headline: fresh ? 'Start here' : `${best.name} is your freshest option`,
    reason,
    overdue,
    underVolume: fresh ? [] : underVolumeMuscles(history, now),
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export { MUSCLE_LABEL as coachMuscleLabel }
