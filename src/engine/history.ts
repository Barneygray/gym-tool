import type { Session, SetLog } from '../types'

export interface Performance {
  startedAt: number
  dayType: Session['dayType']
  sets: SetLog[]
}

/** All logged performances of one exercise, newest first. */
export function performancesOf(exerciseId: string, history: Session[]): Performance[] {
  const out: Performance[] = []
  for (const session of [...history].sort((a, b) => b.startedAt - a.startedAt)) {
    for (const entry of session.entries) {
      if (entry.exerciseId === exerciseId && entry.sets.length > 0) {
        out.push({ startedAt: session.startedAt, dayType: session.dayType, sets: entry.sets })
      }
    }
  }
  return out
}

/** Newest finished session of a given day type. */
export function lastSessionOf(dayType: Session['dayType'], history: Session[]): Session | undefined {
  return [...history]
    .filter((s) => s.dayType === dayType)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}
