import type { Settings } from '../types'
import { unavailableAt } from './equipment'

/**
 * Every exercise id the app should keep out of your way, from two separate
 * refusals that behave identically once a workout is being built:
 *
 * - `settings.excluded` — the lifts you never do, whatever gym you're in. A
 *   bad back and deadlifts, a shoulder and overhead pressing: no rotation,
 *   swap suggestion or add list should keep offering them back.
 * - the active profile's `unavailable` — kit this particular room hasn't got.
 *
 * One set, read by rotation and the pickers alike, so neither kind can leak
 * back into a prescription through a path that forgot to check.
 */
export function excludedIds(settings: Settings): Set<string> {
  const ids = unavailableAt(settings)
  for (const id of settings.excluded ?? []) ids.add(id)
  return ids
}

/** Whether a lift is on the never-prescribe list — gym kit aside. */
export function isExcluded(settings: Settings, id: string): boolean {
  return (settings.excluded ?? []).includes(id)
}

/** The exclusion list with `id` added or removed — the whole toggle, ready to save. */
export function toggleExcluded(settings: Settings, id: string): string[] {
  const current = settings.excluded ?? []
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
}
