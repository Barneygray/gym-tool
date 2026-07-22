import type { Exercise, Session, Settings, Suggestion } from '../types'
import { performancesOf } from './history'
import { isStalled } from './stall'
import { roundToLoadable, roundToStep } from './plates'

export const WORKING_SETS = 3

/**
 * Double progression: work up the rep range at a fixed weight; when every set
 * reaches the top of the range, add weight and rebuild from the bottom.
 * RPE sharpens the jumps: a top-of-range session that still felt easy
 * (avg RPE ≤ 7) earns a double increment.
 */
export function suggestFor(
  exercise: Exercise,
  history: Session[],
  settings: Settings,
): Suggestion {
  const [lo, hi] = exercise.repRange
  const perfs = performancesOf(exercise.id, history)

  if (perfs.length === 0) {
    return {
      weight: 0,
      targetReps: lo,
      sets: WORKING_SETS,
      reason: `First time — pick a weight you could lift ~${hi + 2} times and log ${WORKING_SETS} sets of ${lo}.`,
      kind: 'start',
    }
  }

  const last = perfs[0]
  const topWeight = Math.max(...last.sets.map((s) => s.weight))
  const topSets = last.sets.filter((s) => s.weight === topWeight)

  if (isStalled(exercise.id, history)) {
    const deloaded = loadableRound(exercise, topWeight * 0.9, settings)
    return {
      weight: deloaded,
      targetReps: lo,
      sets: WORKING_SETS,
      reason: `Stalled 3 sessions at ${fmt(topWeight)} kg. Deload to ${fmt(deloaded)} kg and rebuild — or swap to a sibling variation.`,
      kind: 'deload',
    }
  }

  const allAtTop = topSets.length >= WORKING_SETS && topSets.every((s) => s.reps >= hi)
  if (allAtTop) {
    const rpes = topSets.map((s) => s.rpe).filter((r): r is number => r !== undefined)
    const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
    const easy = avgRpe !== null && avgRpe <= 7
    const jump = easy ? exercise.increment * 2 : exercise.increment
    const next = loadableRound(exercise, topWeight + jump, settings)
    return {
      weight: next,
      targetReps: lo,
      sets: WORKING_SETS,
      reason: easy
        ? `Topped the range at ${fmt(topWeight)} kg and it felt easy (RPE ${avgRpe!.toFixed(1)}) — double jump to ${fmt(next)} kg.`
        : `All sets hit ${hi} reps at ${fmt(topWeight)} kg — move up to ${fmt(next)} kg.`,
      kind: 'increase',
    }
  }

  const weakest = Math.min(...topSets.map((s) => s.reps))
  const target = Math.min(Math.max(weakest + 1, lo), hi)
  return {
    weight: topWeight,
    targetReps: target,
    sets: WORKING_SETS,
    reason: `Last time: ${topSets.map((s) => s.reps).join('/')} reps at ${fmt(topWeight)} kg. Beat it — aim for ${target}+ on every set.`,
    kind: 'build',
  }
}

function loadableRound(exercise: Exercise, weight: number, settings: Settings): number {
  if (exercise.barLoaded) return roundToLoadable(weight, settings.barWeightKg, settings.platesKg)
  const step = Math.min(exercise.increment, 2.5) / 2 >= 1 ? 1 : 0.5
  return roundToStep(weight, step)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}
