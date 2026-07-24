import type { BodyLog } from '../types'

/** Resolves the trainee's bodyweight (kg) at a given moment. 0 = unknown. */
export type BodyweightAt = (at: number) => number

/**
 * Build a bodyweight lookup from the log: for a session time, use the most
 * recent reading at or before it; before the first reading, fall back to the
 * earliest known. With no readings it returns 0, so bodyweight-loaded lifts
 * simply fall back to their *added* weight (the pre-bodyweight behaviour).
 */
export function bodyweightAt(log: BodyLog[]): BodyweightAt {
  if (log.length === 0) return () => 0
  const sorted = [...log].sort((a, b) => a.at - b.at)
  return (at: number) => {
    let kg = sorted[0].kg
    for (const entry of sorted) {
      if (entry.at <= at) kg = entry.kg
      else break
    }
    return kg
  }
}

/** Most recent bodyweight in the log, or null if empty. */
export function latestBodyweight(log: BodyLog[]): number | null {
  if (log.length === 0) return null
  return log.reduce((a, b) => (b.at >= a.at ? b : a)).kg
}
