import type { Exercise, SetLog, Settings, Suggestion } from '../types'
import { loadableRound } from './progression'

/**
 * How the next set differs from the one the session walked in with.
 *
 * 'plan' — nothing logged yet, so the target *is* the session prescription.
 * 'up' / 'down' — the load moves for the next set.
 * 'hold' — same weight, a rep target that answers what just happened.
 */
export type LiveKind = 'plan' | 'up' | 'hold' | 'down'

/** What to put on the bar for the next set of *this* session. */
export interface LiveTarget {
  weight: number
  reps: number
  /** Which set of the exercise this is, 1-based. */
  setNumber: number
  /** True once `setNumber` is past the prescribed set count — bonus work. */
  beyondPlan: boolean
  kind: LiveKind
  /** Why this target, in one or two sentences, always mentioning the last set. */
  reason: string
  /**
   * A set this session has already topped the rep range at the session's top
   * weight, so next session's suggestion will add weight. Worth surfacing while
   * you're still standing there: it turns the remaining sets from "chasing a
   * target" into "banking work at a weight that's already earned the jump".
   */
  banked: boolean
}

/** RPE at or below which a set had enough left in it to ask for more. */
const EASY = 7
/** RPE at or above which the next set gets no more asked of it. */
const HARD = 9

/**
 * The target for the next set, recomputed from what you've actually logged.
 *
 * The session prescription is a plan made before you touched the bar — it reads
 * three sessions of history and can't know that set one came apart, or flew.
 * Between sets, though, the best evidence in the world is thirty seconds old and
 * sitting in `done`: the reps you just got and how hard they felt. So each logged
 * set re-derives the next one.
 *
 * The moves are the ones a coach standing next to you would make, and they're
 * deliberately asymmetric. Up needs the top of the range *and* an easy tag, so
 * the load only climbs mid-session on real evidence. Down waits until reps fall
 * out of the bottom of the range, because a single hard set is training, not a
 * mistake. Everything between holds the weight and moves the rep target — which
 * is double progression's own logic, run at the resolution of one set.
 *
 * A set logged "not sure" reads as neither easy nor hard: it holds, which is what
 * the app did before any of this existed.
 */
export function nextSetTarget(
  exercise: Exercise,
  plan: Suggestion,
  done: SetLog[],
  settings: Settings,
): LiveTarget {
  const [lo, hi] = exercise.repRange
  const setNumber = done.length + 1
  const beyondPlan = setNumber > plan.sets
  const topWeight = done.length > 0 ? Math.max(...done.map((s) => s.weight)) : 0
  // Judged the way the between-session engine judges it: at the top weight of
  // the session, so a light back-off set can't claim the jump.
  const banked = done.some((s) => s.weight === topWeight && s.reps >= hi)

  if (done.length === 0) {
    return {
      weight: plan.weight,
      reps: plan.targetReps,
      setNumber,
      beyondPlan,
      kind: 'plan',
      reason: plan.reason,
      banked: false,
    }
  }

  const last = done[done.length - 1]
  const rpe = last.rpe
  const felt = rpe === undefined ? '' : ` at RPE ${rpe}`
  const said = `Set ${done.length}: ${fmt(last.weight)} kg × ${last.reps}${felt}.`
  const bankedNote = banked ? ` ${hi} reps is on the board, so next session moves up either way.` : ''

  // Reps fell out of the bottom of the range: the set stopped being the work it
  // was meant to be, so the load comes down rather than the range being abandoned.
  if (last.reps < lo) {
    const dropped = loadableRound(exercise, last.weight - exercise.increment, settings)
    if (dropped < last.weight) {
      return {
        weight: dropped, reps: lo, setNumber, beyondPlan, kind: 'down', banked,
        reason: `${said} That's under the range — drop to ${fmt(dropped)} kg so the rest land inside it.${bankedNote}`,
      }
    }
    return {
      weight: last.weight, reps: lo, setNumber, beyondPlan, kind: 'hold', banked,
      reason: `${said} Under the range, and there's nothing smaller to drop to — hold ${fmt(last.weight)} kg and get ${lo}.${bankedNote}`,
    }
  }

  // Topped the range. With something left in the tank that's the whole trigger,
  // and there's no reason to spend the remaining sets proving it again.
  if (last.reps >= hi) {
    if (rpe !== undefined && rpe <= EASY) {
      const up = loadableRound(exercise, last.weight + exercise.increment, settings)
      if (up > last.weight) {
        return {
          weight: up, reps: lo, setNumber, beyondPlan, kind: 'up', banked,
          reason: `${said} Top of the range with reps to spare — take the jump now: ${fmt(up)} kg for ${lo}+. Next session starts here.`,
        }
      }
    }
    return {
      weight: last.weight, reps: hi, setNumber, beyondPlan, kind: 'hold', banked,
      reason: `${said} Range topped${rpe !== undefined && rpe >= HARD ? ', and it cost you' : ''} — stay at ${fmt(last.weight)} kg and match it.${bankedNote}`,
    }
  }

  // Inside the range. The rep target is the only thing that moves: up one when
  // the tag says there was room, down one when it says there wasn't.
  if (rpe !== undefined && rpe >= HARD) {
    const eased = Math.max(lo, last.reps - 1)
    return {
      weight: last.weight, reps: eased, setNumber, beyondPlan, kind: 'hold', banked,
      reason: `${said} That was near the limit — hold ${fmt(last.weight)} kg and take ${eased}; a rep of drop-off across sets is normal, not a failure.${bankedNote}`,
    }
  }

  if (rpe !== undefined && rpe <= EASY) {
    const more = Math.min(hi, last.reps + 1)
    return {
      weight: last.weight, reps: more, setNumber, beyondPlan, kind: 'hold', banked,
      reason: `${said} You had a few left — ask for ${more} this time.${!banked && more >= hi ? ` That tops the range and moves the weight up.` : ''}${bankedNote}`,
    }
  }

  return {
    weight: last.weight, reps: last.reps, setNumber, beyondPlan, kind: 'hold', banked,
    reason: `${said} Match it — ${fmt(last.weight)} kg × ${last.reps}${!banked ? `, and ${hi} tops the range` : ''}.${bankedNote}`,
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}
