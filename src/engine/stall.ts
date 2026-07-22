import type { Session } from '../types'
import { performancesOf, type Performance } from './history'
import { bestSetE1rm } from './stats'

/** Did `current` beat `previous` in weight or reps-at-top-weight (or estimated 1RM)? */
export function madeProgress(current: Performance, previous: Performance): boolean {
  const maxW = (p: Performance) => Math.max(0, ...p.sets.map((s) => s.weight))
  const repsAt = (p: Performance, w: number) =>
    p.sets.filter((s) => s.weight === w).reduce((t, s) => t + s.reps, 0)

  const cw = maxW(current)
  const pw = maxW(previous)
  if (cw > pw) return true
  if (cw === pw && repsAt(current, cw) > repsAt(previous, pw)) return true
  return bestSetE1rm(current.sets) > bestSetE1rm(previous.sets) + 1e-9
}

/**
 * Stalled = the last three performances of the exercise show zero progress
 * (neither the latest beat the one before, nor that one the one before it).
 */
export function isStalled(exerciseId: string, history: Session[]): boolean {
  const perfs = performancesOf(exerciseId, history)
  if (perfs.length < 3) return false
  return !madeProgress(perfs[0], perfs[1]) && !madeProgress(perfs[1], perfs[2])
}
