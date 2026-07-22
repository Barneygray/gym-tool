import type { DayTemplate, Session } from '../types'
import { EXERCISES, exerciseById } from '../data/exercises'
import { performancesOf } from './history'

/**
 * Build today's workout for a day template: for every slot pick the pool
 * exercise done least recently, so variations alternate session to session.
 */
export function generateWorkout(day: DayTemplate, history: Session[]): string[] {
  const picks: string[] = []
  for (const slot of day.slots) {
    const ranked = [...slot.pool]
      .filter((id) => !picks.includes(id))
      .sort((a, b) => lastDone(a, history) - lastDone(b, history))
    if (ranked.length > 0) picks.push(ranked[0])
  }
  return picks
}

function lastDone(exerciseId: string, history: Session[]): number {
  const perfs = performancesOf(exerciseId, history)
  return perfs.length > 0 ? perfs[0].startedAt : 0
}

/**
 * Like-exercise alternatives: same variation group first, then anything else
 * hitting the same primary muscle. Excludes exercises already in the workout.
 */
export function swapOptions(exerciseId: string, currentWorkout: string[]): string[] {
  const exercise = exerciseById.get(exerciseId)
  if (!exercise) return []
  const taken = new Set(currentWorkout)
  const siblings = EXERCISES.filter(
    (e) => e.id !== exerciseId && !taken.has(e.id) && e.variationGroup === exercise.variationGroup,
  )
  const sameMuscle = EXERCISES.filter(
    (e) =>
      e.id !== exerciseId &&
      !taken.has(e.id) &&
      e.variationGroup !== exercise.variationGroup &&
      e.primary === exercise.primary,
  )
  return [...siblings, ...sameMuscle].map((e) => e.id)
}
