import type { Muscle, Session, SetLog } from '../types'
import { exerciseById, isBodyweightLoaded } from '../data/exercises'
import { performancesOf, type Performance } from './history'
import type { BodyweightAt } from './bodyweight'

/** No-op bodyweight resolver: bodyweight-loaded lifts fall back to added weight. */
const NO_BW: BodyweightAt = () => 0

/**
 * Real load of a set: for bodyweight-loaded lifts (pull-ups, dips…) that's
 * bodyweight-at-the-time plus the added weight; for everything else it's just
 * the logged weight. With the no-op resolver it equals the logged weight, so
 * callers that don't care about bodyweight keep the original behaviour.
 */
export function effectiveLoad(exerciseId: string, set: SetLog, at: number, bwAt: BodyweightAt = NO_BW): number {
  const ex = exerciseById.get(exerciseId)
  if (ex && isBodyweightLoaded(ex)) return bwAt(at) + set.weight
  return set.weight
}

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function bestSetE1rm(sets: SetLog[]): number {
  return Math.max(0, ...sets.map((s) => e1rm(s.weight, s.reps)))
}

export interface E1rmPoint {
  date: number
  e1rm: number
}

/** e1RM trend for an exercise, oldest first. */
export function e1rmTrend(exerciseId: string, history: Session[], bwAt: BodyweightAt = NO_BW): E1rmPoint[] {
  return performancesOf(exerciseId, history)
    .map((p) => ({
      date: p.startedAt,
      e1rm: Math.max(0, ...p.sets.map((s) => e1rm(effectiveLoad(exerciseId, s, p.startedAt, bwAt), s.reps))),
    }))
    .filter((p) => p.e1rm > 0)
    .reverse()
}

export interface ExercisePRs {
  maxWeight: { weight: number; reps: number; date: number } | null
  bestE1rm: { value: number; weight: number; reps: number; date: number } | null
}

export function prsFor(exerciseId: string, history: Session[], bwAt: BodyweightAt = NO_BW): ExercisePRs {
  let maxWeight: ExercisePRs['maxWeight'] = null
  let bestE1rm: ExercisePRs['bestE1rm'] = null
  for (const p of performancesOf(exerciseId, history)) {
    for (const s of p.sets) {
      if (s.reps <= 0) continue
      const load = effectiveLoad(exerciseId, s, p.startedAt, bwAt)
      if (load <= 0) continue
      if (!maxWeight || load > maxWeight.weight ||
        (load === maxWeight.weight && s.reps > maxWeight.reps)) {
        maxWeight = { weight: load, reps: s.reps, date: p.startedAt }
      }
      const est = e1rm(load, s.reps)
      if (!bestE1rm || est > bestE1rm.value) {
        bestE1rm = { value: est, weight: load, reps: s.reps, date: p.startedAt }
      }
    }
  }
  return { maxWeight, bestE1rm }
}

/** PRs achieved by `session` relative to everything logged before it. */
export function newPRsInSession(session: Session, history: Session[], bwAt: BodyweightAt = NO_BW): {
  exerciseId: string
  kind: 'weight' | 'e1rm'
  weight: number
  reps: number
}[] {
  const before = history.filter((s) => s.startedAt < session.startedAt)
  const out: { exerciseId: string; kind: 'weight' | 'e1rm'; weight: number; reps: number }[] = []
  for (const entry of session.entries) {
    const prior = prsFor(entry.exerciseId, before, bwAt)
    let bestNewWeight: { load: number; reps: number } | null = null
    let bestNewE1rm: { load: number; reps: number } | null = null
    for (const s of entry.sets) {
      if (s.reps <= 0) continue
      const load = effectiveLoad(entry.exerciseId, s, session.startedAt, bwAt)
      if (load <= 0) continue
      if (load > (prior.maxWeight?.weight ?? 0) && load > (bestNewWeight?.load ?? 0)) {
        bestNewWeight = { load, reps: s.reps }
      }
      const est = e1rm(load, s.reps)
      if (est > (prior.bestE1rm?.value ?? 0) && est > (bestNewE1rm ? e1rm(bestNewE1rm.load, bestNewE1rm.reps) : 0)) {
        bestNewE1rm = { load, reps: s.reps }
      }
    }
    if (bestNewWeight) {
      out.push({ exerciseId: entry.exerciseId, kind: 'weight', weight: bestNewWeight.load, reps: bestNewWeight.reps })
    } else if (bestNewE1rm) {
      out.push({ exerciseId: entry.exerciseId, kind: 'e1rm', weight: bestNewE1rm.load, reps: bestNewE1rm.reps })
    }
  }
  return out
}

/** Tonnage (weight × reps) per muscle for sessions in [from, to). Secondary muscles count half. */
export function volumeByMuscle(history: Session[], from: number, to: number, bwAt: BodyweightAt = NO_BW): Map<Muscle, number> {
  const vol = new Map<Muscle, number>()
  for (const session of history) {
    if (session.startedAt < from || session.startedAt >= to) continue
    for (const entry of session.entries) {
      const exercise = exerciseById.get(entry.exerciseId)
      if (!exercise) continue
      const tonnage = entry.sets.reduce((t, s) => t + effectiveLoad(entry.exerciseId, s, session.startedAt, bwAt) * s.reps, 0)
      vol.set(exercise.primary, (vol.get(exercise.primary) ?? 0) + tonnage)
      for (const m of exercise.secondary) {
        vol.set(m, (vol.get(m) ?? 0) + tonnage * 0.5)
      }
    }
  }
  return vol
}

/** Days since each muscle was last trained (primary or secondary). Infinity = never. */
export function recoveryByMuscle(history: Session[], now: number): Map<Muscle, number> {
  const lastTrained = new Map<Muscle, number>()
  for (const session of history) {
    for (const entry of session.entries) {
      if (entry.sets.length === 0) continue
      const exercise = exerciseById.get(entry.exerciseId)
      if (!exercise) continue
      for (const m of [exercise.primary, ...exercise.secondary]) {
        lastTrained.set(m, Math.max(lastTrained.get(m) ?? 0, session.startedAt))
      }
    }
  }
  const out = new Map<Muscle, number>()
  const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
  for (const m of MUSCLES) {
    const t = lastTrained.get(m)
    out.set(m, t === undefined ? Infinity : (now - t) / 86_400_000)
  }
  return out
}

export function daysSince(ts: number | undefined, now: number): number | null {
  if (ts === undefined) return null
  return Math.floor((now - ts) / 86_400_000)
}

export { performancesOf }
export type { Performance }
