import type { Session, SetLog } from '../types'
import { MOBILITY } from '../types'
import type { ActiveWorkout } from '../App'

/**
 * Finishing is a one-way door in every other respect — the session is written,
 * the engine folds it into the next suggestions — but it is also one tap away
 * from a half-finished workout. Tapping it early shouldn't cost you the second
 * half of the session, or force you to log it as a separate one that reads in
 * the history as two short workouts on the same day.
 *
 * So a finished session stays re-openable for the rest of the day it belongs
 * to. Continuing one reopens the *same* record — same uuid, same start time —
 * rather than starting a second, so the log, the tonnage and the elapsed
 * minutes all end up describing the one workout that actually happened.
 */

/** When a session ended, falling back to its start for anything unfinished. */
const endedAt = (s: Session): number => s.finishedAt ?? s.startedAt

/** Local calendar day of a timestamp. */
function dayOf(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Logged conditioning and mobility aren't sessions you walk back into — they're
 * recorded whole, with no stations and nothing left to add — so they're never
 * what "continue" means, even when they're the newest thing in the log.
 */
const isGymSession = (s: Session): boolean =>
  s.dayType !== 'conditioning' && s.dayType !== MOBILITY && s.entries.length > 0

/**
 * The session "continue" would reopen: the most recent gym session, while it's
 * still the day it ended on. Deliberately keyed on when it *ended*, so a
 * session that ran past midnight stays resumable in the small hours instead of
 * expiring the moment the date rolls over mid-workout.
 */
export function resumableSession(history: Session[], now: number): Session | null {
  let latest: Session | null = null
  for (const s of history) {
    if (!isGymSession(s)) continue
    if (latest === null || endedAt(s) > endedAt(latest)) latest = s
  }
  if (latest === null || dayOf(endedAt(latest)) !== dayOf(now)) return null
  return latest
}

/** Rebuild the live workout a finished session was logged from. */
export function resumeWorkout(session: Session): ActiveWorkout {
  const exerciseIds = session.entries.map((e) => e.exerciseId)
  const logged: Record<string, SetLog[]> = {}
  for (const entry of session.entries) logged[entry.exerciseId] = entry.sets.map((s) => ({ ...s }))
  return {
    dayType: session.dayType,
    // Kept, not restamped: the session's duration should span the whole
    // workout, not just the part after the mis-tap.
    startedAt: session.startedAt,
    exerciseIds,
    logged,
    // Drop back in at the last station you logged against, which is where you
    // were standing when you hit finish.
    currentIndex: Math.max(0, exerciseIds.length - 1),
    readiness: session.readiness ?? null,
    sessionUuid: session.uuid,
    // Supersets aren't part of a saved session — they're how you ran it, not
    // what you did — so a resumed workout has no pairings to alternate between.
  }
}

/**
 * History as the engine should read it while a session is being continued. The
 * session is already saved, so left in place it would be its own "last time":
 * every suggestion would try to progress on top of the sets you logged twenty
 * minutes ago, and the set you're about to do would look like a regression.
 */
export function withoutSession(history: Session[], uuid: string | undefined): Session[] {
  return uuid === undefined ? history : history.filter((s) => s.uuid !== uuid)
}

/** How long ago the session was logged, for the resume prompt. */
export function finishedAgoLabel(session: Session, now: number): string {
  const mins = Math.floor((now - endedAt(session)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
}
