import type { Muscle, Session } from '../types'
import { exerciseById } from '../data/exercises'

/**
 * Weekly hard-set landmarks per muscle (sets/week). MEV = minimum effective
 * volume to keep growing; MRV ≈ the most you can usefully recover from. These
 * are round, defensible hypertrophy guidelines, not gospel — a band to aim
 * inside, not a precise prescription.
 */
export const MUSCLE_TARGETS: Record<Muscle, { mev: number; mrv: number }> = {
  chest: { mev: 10, mrv: 22 },
  back: { mev: 10, mrv: 25 },
  shoulders: { mev: 10, mrv: 24 },
  biceps: { mev: 8, mrv: 20 },
  triceps: { mev: 8, mrv: 20 },
  quads: { mev: 8, mrv: 20 },
  hamstrings: { mev: 6, mrv: 16 },
  glutes: { mev: 4, mrv: 16 },
  calves: { mev: 8, mrv: 18 },
  core: { mev: 6, mrv: 20 },
}

export const MUSCLES: Muscle[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
]

export type VolumeStatus = 'none' | 'under' | 'optimal' | 'high'

/**
 * Hard sets per muscle across [from, to). A working set counts fully toward its
 * primary muscle and half toward each secondary — the same half-credit the
 * tonnage chart uses. Conditioning and unknown exercises are ignored.
 */
export function weeklySetsByMuscle(history: Session[], from: number, to: number): Map<Muscle, number> {
  const sets = new Map<Muscle, number>()
  for (const session of history) {
    if (session.startedAt < from || session.startedAt >= to) continue
    for (const entry of session.entries) {
      const exercise = exerciseById.get(entry.exerciseId)
      if (!exercise) continue
      const working = entry.sets.filter((s) => s.reps > 0).length
      if (working === 0) continue
      sets.set(exercise.primary, (sets.get(exercise.primary) ?? 0) + working)
      for (const m of exercise.secondary) {
        sets.set(m, (sets.get(m) ?? 0) + working * 0.5)
      }
    }
  }
  return sets
}

/** Where a week's set count for a muscle sits relative to its MEV/MRV band. */
export function volumeStatus(muscle: Muscle, sets: number): VolumeStatus {
  const { mev, mrv } = MUSCLE_TARGETS[muscle]
  if (sets <= 0) return 'none'
  if (sets < mev) return 'under'
  if (sets > mrv) return 'high'
  return 'optimal'
}

/**
 * Muscles below their MEV this week, most-deficient first. Muscles never
 * trained at all are excluded (that's the coach's "overdue" job) so this
 * highlights specifically under-dosed — but not absent — muscle groups.
 */
export function underVolumeMuscles(history: Session[], now: number): Muscle[] {
  const week = weeklySetsByMuscle(history, now - 7 * 86_400_000, now + 1)
  return MUSCLES
    .map((m) => ({ m, sets: week.get(m) ?? 0 }))
    .filter(({ m, sets }) => sets > 0 && sets < MUSCLE_TARGETS[m].mev)
    .sort((a, b) => a.sets / MUSCLE_TARGETS[a.m].mev - b.sets / MUSCLE_TARGETS[b.m].mev)
    .map(({ m }) => m)
}
