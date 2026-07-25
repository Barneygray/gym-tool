import type { ReadinessLevel } from '../types'

export interface ReadinessEffect {
  level: ReadinessLevel
  /** Working-set delta applied on top of the mesocycle's own bias. */
  setBias: number
  /** Load multiplier, applied on top of the mesocycle's intensity. */
  intensity: number
  label: string
  /** Short line shown on the day's prescription when it isn't 'normal'. */
  note: string
}

/**
 * How a pre-session self-rating bends the day's prescription. Readiness is the
 * cheapest autoregulation there is: the engine can read your last session's
 * numbers, but it can't tell that you slept four hours or that your shoulder is
 * angry. A bad day backs the load off and trims a set so you still train
 * without digging a recovery hole; a good day earns one extra set.
 *
 * Deliberately conservative — this multiplies with the mesocycle phase, and two
 * aggressive modifiers stacking is how people get hurt.
 */
const EFFECTS: Record<ReadinessLevel, ReadinessEffect> = {
  fresh: {
    level: 'fresh',
    setBias: 1,
    intensity: 1,
    label: 'Fresh',
    note: 'Feeling strong — one extra set if the reps stay crisp.',
  },
  normal: {
    level: 'normal',
    setBias: 0,
    intensity: 1,
    label: 'Normal',
    note: '',
  },
  beat: {
    level: 'beat',
    setBias: -1,
    intensity: 0.9,
    label: 'Beat up',
    note: 'Low readiness — 90% load, a set trimmed. Get the work in, don’t grind.',
  },
}

export const READINESS_LEVELS: ReadinessLevel[] = ['fresh', 'normal', 'beat']

export function readinessEffect(level?: ReadinessLevel | null): ReadinessEffect | null {
  if (!level) return null
  return EFFECTS[level] ?? null
}

export function readinessLabel(level: ReadinessLevel): string {
  return EFFECTS[level].label
}
