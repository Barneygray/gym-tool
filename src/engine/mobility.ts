import type { Muscle, Session } from '../types'
import { MOBILITY } from '../types'
import { ALL_STRETCH_GROUPS, DESK_RESCUE, groupIdOfStretch, stretchGroupById } from '../data/stretches'
import { exerciseById } from '../data/exercises'

const DAY = 86_400_000
/** Days after which a stretch group counts as neglected. */
export const STALE_AFTER = 10

/**
 * Sessions that count as *training*. Conditioning and mobility are logged the
 * same way and sync the same way, but neither is a gym session: counting them
 * would suppress the training reminder and inflate the consistency chart.
 */
export function isGymSession(session: Session): boolean {
  return session.dayType !== 'conditioning' && session.dayType !== MOBILITY
}

export function isMobilitySession(session: Session): boolean {
  return session.dayType === MOBILITY
}

/** Last time each stretch group was logged, keyed by group id. */
export function lastStretchedByGroup(history: Session[]): Map<string, number> {
  const last = new Map<string, number>()
  for (const session of history) {
    if (!isMobilitySession(session)) continue
    for (const entry of session.entries) {
      const groupId = groupIdOfStretch.get(entry.exerciseId)
      if (!groupId) continue
      last.set(groupId, Math.max(last.get(groupId) ?? 0, session.startedAt))
    }
  }
  return last
}

/** Days since a group was last stretched; Infinity = never. */
export function daysSinceStretched(history: Session[], now: number): Map<string, number> {
  const last = lastStretchedByGroup(history)
  const out = new Map<string, number>()
  for (const group of ALL_STRETCH_GROUPS) {
    const at = last.get(group.id)
    out.set(group.id, at === undefined ? Infinity : (now - at) / DAY)
  }
  return out
}

/** Muscles trained in the last four weeks — the ones worth stretching. */
function recentlyTrained(history: Session[], now: number): Set<Muscle> {
  const muscles = new Set<Muscle>()
  for (const session of history) {
    if (!isGymSession(session) || now - session.startedAt > 28 * DAY) continue
    for (const entry of session.entries) {
      const exercise = exerciseById.get(entry.exerciseId)
      if (!exercise) continue
      muscles.add(exercise.primary)
      for (const m of exercise.secondary) muscles.add(m)
    }
  }
  return muscles
}

/**
 * Groups gone stale, most-neglected first — limited to muscles actually being
 * trained. Nagging about hip mobility when someone has never trained legs is
 * noise; nagging once their squats are underway is the point. Desk-rescue
 * groups are exempt from that filter: sitting all day is reason enough.
 */
export function staleGroups(history: Session[], now: number): string[] {
  const trained = recentlyTrained(history, now)
  const since = daysSinceStretched(history, now)
  const relevant = (g: (typeof ALL_STRETCH_GROUPS)[number]) =>
    DESK_RESCUE.some((d) => d.id === g.id) || g.muscles.some((m) => trained.has(m))

  return ALL_STRETCH_GROUPS
    .filter((g) => relevant(g) && (since.get(g.id) ?? Infinity) >= STALE_AFTER)
    .sort((a, b) => (since.get(b.id) ?? Infinity) - (since.get(a.id) ?? Infinity))
    .map((g) => g.id)
}

/** Group names for a list of ids, for display. */
export function groupNames(ids: string[]): string[] {
  return ids.map((id) => stretchGroupById.get(id)?.name ?? id)
}

/**
 * Stretch groups worth offering after a session: the ones covering the muscles
 * just trained, neglected first. This is the moment they'll actually get done —
 * warm, finished, phone already in hand.
 */
export function groupsForMuscles(muscles: Muscle[], history: Session[], now: number): string[] {
  const wanted = new Set(muscles)
  const since = daysSinceStretched(history, now)
  return ALL_STRETCH_GROUPS
    .filter((g) => g.muscles.some((m) => wanted.has(m)))
    .sort((a, b) => (since.get(b.id) ?? Infinity) - (since.get(a.id) ?? Infinity))
    .map((g) => g.id)
}
