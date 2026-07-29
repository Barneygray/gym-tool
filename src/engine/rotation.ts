import type { DaySlot, DayTemplate, Session } from '../types'
import { EXERCISES, exerciseById } from '../data/exercises'
import { performancesOf } from './history'

const NONE: ReadonlySet<string> = new Set()

/**
 * Build today's workout for a day template: for every slot pick the pool
 * exercise done least recently, so variations alternate session to session.
 *
 * `excluded` is the never-prescribe list (see engine/exclusions) — the lifts
 * you don't do plus whatever this gym can't do. A slot still owes the day its
 * muscle when its whole pool is off the table, so it falls back to anything
 * else training that muscle rather than quietly leaving the day a lift short.
 */
export function generateWorkout(
  day: DayTemplate,
  history: Session[],
  excluded: ReadonlySet<string> = NONE,
): string[] {
  const picks: string[] = []
  for (const slot of day.slots) {
    const pool = slot.pool.filter((id) => !excluded.has(id) && !picks.includes(id))
    const ranked = (pool.length > 0 ? pool : standIns(slot, picks, excluded))
      .sort((a, b) => lastDone(a, history) - lastDone(b, history))
    if (ranked.length > 0) picks.push(ranked[0])
  }
  return picks
}

/** Catalog exercises for a slot's muscle, for when its own pool is all excluded. */
function standIns(slot: DaySlot, picks: string[], excluded: ReadonlySet<string>): string[] {
  return EXERCISES
    .filter((e) => e.primary === slot.muscle && !excluded.has(e.id) && !picks.includes(e.id))
    .map((e) => e.id)
}

function lastDone(exerciseId: string, history: Session[]): number {
  const perfs = performancesOf(exerciseId, history)
  return perfs.length > 0 ? perfs[0].startedAt : 0
}

/**
 * Like-exercise alternatives: same variation group first, then anything else
 * hitting the same primary muscle. Excludes exercises already in the workout,
 * and anything on the never-prescribe list — a swap is exactly where a lift
 * you've sworn off would otherwise come straight back.
 */
export function swapOptions(
  exerciseId: string,
  currentWorkout: string[],
  excluded: ReadonlySet<string> = NONE,
): string[] {
  const exercise = exerciseById.get(exerciseId)
  if (!exercise) return []
  const taken = new Set(currentWorkout)
  const eligible = EXERCISES.filter(
    (e) => e.id !== exerciseId && !taken.has(e.id) && !excluded.has(e.id),
  )
  const siblings = eligible.filter((e) => e.variationGroup === exercise.variationGroup)
  const sameMuscle = eligible.filter(
    (e) => e.variationGroup !== exercise.variationGroup && e.primary === exercise.primary,
  )
  return [...siblings, ...sameMuscle].map((e) => e.id)
}
