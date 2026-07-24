import type { Goal, Session } from '../types'
import { e1rmTrend } from './stats'
import type { BodyweightAt } from './bodyweight'

const WEEK = 7 * 86_400_000
const NO_BW: BodyweightAt = () => 0

export interface GoalProjection {
  /** Best estimated 1RM logged so far, kg (0 if never trained). */
  current: number
  /** Progress toward target, 0–1 (clamped). */
  pct: number
  achieved: boolean
  /** Fitted gain in kg per week; ≤0 means flat or regressing. */
  perWeek: number
  /** Projected date (epoch ms) the trend crosses the target, or null if it won't. */
  projectedAt: number | null
  /** vs. the goal's own deadline: true = on/ahead of pace, false = behind. */
  onPace: boolean | null
}

/**
 * Least-squares fit over the exercise's e1RM history, extrapolated to the
 * target. Uses weeks-since-first-session as x so the slope reads as kg/week.
 * With one or two points we still report current vs. target, but can't project.
 */
export function projectGoal(
  goal: Goal,
  history: Session[],
  bwAt: BodyweightAt = NO_BW,
  now: number = Date.now(),
): GoalProjection {
  const trend = e1rmTrend(goal.exerciseId, history, bwAt)
  const current = trend.length > 0 ? Math.max(...trend.map((p) => p.e1rm)) : 0
  const achieved = current >= goal.targetE1rm
  const pct = goal.targetE1rm > 0 ? Math.max(0, Math.min(1, current / goal.targetE1rm)) : 0

  if (trend.length < 2 || achieved) {
    return { current, pct, achieved, perWeek: 0, projectedAt: null, onPace: null }
  }

  const t0 = trend[0].date
  const xs = trend.map((p) => (p.date - t0) / WEEK)
  const ys = trend.map((p) => p.e1rm)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const perWeek = den === 0 ? 0 : num / den
  const intercept = meanY - perWeek * meanX

  if (perWeek <= 0) {
    return { current, pct, achieved, perWeek, projectedAt: null, onPace: goal.targetDate ? false : null }
  }

  // Solve intercept + perWeek·x = target for x (weeks from t0), then to epoch.
  const weeksToTarget = (goal.targetE1rm - intercept) / perWeek
  const projectedAt = t0 + weeksToTarget * WEEK
  const clamped = Math.max(projectedAt, now) // never project into the past
  const onPace = goal.targetDate ? clamped <= goal.targetDate : null

  return { current, pct, achieved, perWeek, projectedAt: clamped, onPace }
}

/**
 * Goals whose target is now met but not yet stamped achieved — the caller
 * stamps `achievedAt` so the win is recorded once.
 */
export function newlyAchieved(
  goals: Goal[],
  history: Session[],
  bwAt: BodyweightAt = NO_BW,
): Goal[] {
  return goals.filter((g) => !g.achievedAt && projectGoal(g, history, bwAt).achieved)
}
