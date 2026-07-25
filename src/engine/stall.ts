import type { Session, SetLog } from '../types'
import { performancesOf, type Performance } from './history'
import { bestReliableE1rm, effectiveLoad } from './stats'
import type { BodyweightAt } from './bodyweight'

/** No-op bodyweight resolver — bodyweight lifts fall back to added weight. */
const NO_BW: BodyweightAt = () => 0

/**
 * Did `current` beat `previous` in weight or reps-at-top-weight (or estimated
 * 1RM)? Comparisons run on *effective* load, so a pull-up held at the same reps
 * through a bodyweight gain reads as progress — the same rule the e1RM trend,
 * PR table, and tonnage charts already use. Called without an exercise id this
 * reduces to the logged weight, i.e. the original behaviour.
 */
export function madeProgress(
  current: Performance,
  previous: Performance,
  exerciseId?: string,
  bwAt: BodyweightAt = NO_BW,
): boolean {
  const load = (p: Performance, s: SetLog) =>
    exerciseId === undefined ? s.weight : effectiveLoad(exerciseId, s, p.startedAt, bwAt)

  const maxW = (p: Performance) => Math.max(0, ...p.sets.map((s) => load(p, s)))
  const repsAt = (p: Performance, w: number) =>
    p.sets.filter((s) => load(p, s) === w).reduce((t, s) => t + s.reps, 0)

  const cw = maxW(current)
  const pw = maxW(previous)
  if (cw > pw) return true
  if (cw === pw && repsAt(current, cw) > repsAt(previous, pw)) return true

  // The e1RM tie-break only runs on sets in the rep window where the estimate
  // holds up. Out past that, a change of rep scheme moves the number around
  // enough to read as progress (or a stall) that never happened — and a stall
  // verdict here costs the trainee a deload they didn't need.
  const cur = bestReliableE1rm(current.sets, (s) => load(current, s))
  const prev = bestReliableE1rm(previous.sets, (s) => load(previous, s))
  if (cur === 0 || prev === 0) return false
  return cur > prev + 1e-9
}

/**
 * Stalled = the last three performances of the exercise show zero progress
 * (neither the latest beat the one before, nor that one the one before it).
 */
export function isStalled(
  exerciseId: string,
  history: Session[],
  bwAt: BodyweightAt = NO_BW,
): boolean {
  const perfs = performancesOf(exerciseId, history)
  if (perfs.length < 3) return false
  return (
    !madeProgress(perfs[0], perfs[1], exerciseId, bwAt) &&
    !madeProgress(perfs[1], perfs[2], exerciseId, bwAt)
  )
}
