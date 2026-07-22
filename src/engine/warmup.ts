import type { Exercise, Settings } from '../types'
import { roundToLoadable, roundToStep } from './plates'

export interface WarmupSet {
  weight: number
  reps: number
  label: string
}

/**
 * Ramp-up sets before the first working set of a compound lift.
 * Skipped for isolation work and weights too light to need a ramp.
 */
export function warmupRamp(
  exercise: Exercise,
  workingWeight: number,
  settings: Settings,
): WarmupSet[] {
  if (!exercise.isCompound || workingWeight <= 0) return []
  const bar = settings.barWeightKg

  const round = (w: number) =>
    exercise.barLoaded ? roundToLoadable(w, bar, settings.platesKg) : Math.max(roundToStep(w, 2), 0)

  if (exercise.barLoaded) {
    if (workingWeight <= bar * 1.5) {
      return [{ weight: bar, reps: 10, label: 'Empty bar' }]
    }
    const ramp: WarmupSet[] = [{ weight: bar, reps: 10, label: 'Empty bar' }]
    const pcts: [number, number][] = [[0.4, 8], [0.6, 5], [0.8, 3]]
    for (const [pct, reps] of pcts) {
      const w = round(workingWeight * pct)
      if (w > bar && w < workingWeight) ramp.push({ weight: w, reps, label: `${Math.round(pct * 100)}%` })
    }
    return ramp
  }

  // Dumbbell / machine / bodyweight compounds: two lighter feel sets.
  if (workingWeight < 20) return []
  return (
    [[0.5, 10], [0.75, 5]] as [number, number][]
  ).map(([pct, reps]) => ({
    weight: round(workingWeight * pct),
    reps,
    label: `${Math.round(pct * 100)}%`,
  })).filter((s) => s.weight > 0 && s.weight < workingWeight)
}
