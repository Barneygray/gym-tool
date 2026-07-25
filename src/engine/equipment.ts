import type { EquipmentProfile, Session, Settings } from '../types'

export const DEFAULT_PROFILE_ID = 'default'

/**
 * Common plate sets, offered as one-tap presets. The default list assumes a
 * fully stocked commercial gym — including 1.25s, which plenty of places don't
 * have. That matters more than it sounds: `roundToLoadable` snaps every barbell
 * suggestion to this list, so an optimistic set produces target weights you
 * can't actually load.
 */
export const PLATE_PRESETS: { name: string; barWeightKg: number; platesKg: number[] }[] = [
  { name: 'Commercial gym', barWeightKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] },
  { name: 'No micro plates', barWeightKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5] },
  { name: 'Home rack', barWeightKg: 20, platesKg: [20, 10, 5, 2.5, 1.25] },
  { name: 'Light bar', barWeightKg: 15, platesKg: [20, 10, 5, 2.5, 1.25] },
]

export function makeProfile(input: {
  id?: string
  name: string
  barWeightKg?: number
  platesKg?: number[]
  unavailable?: string[]
}): EquipmentProfile {
  return {
    id: input.id ?? `gym-${crypto.randomUUID()}`,
    name: input.name.trim() || 'My gym',
    barWeightKg: input.barWeightKg ?? 20,
    platesKg: [...(input.platesKg ?? PLATE_PRESETS[0].platesKg)].sort((a, b) => b - a),
    ...(input.unavailable && input.unavailable.length > 0 ? { unavailable: input.unavailable } : {}),
  }
}

/** Every configured profile, or a single implicit one built from the flat fields. */
export function profilesOf(settings: Settings): EquipmentProfile[] {
  const stored = settings.profiles ?? []
  if (stored.length > 0) return stored
  return [{
    id: DEFAULT_PROFILE_ID,
    name: 'My gym',
    barWeightKg: settings.barWeightKg,
    platesKg: settings.platesKg,
  }]
}

/** The profile in force, falling back to the first when the active id is stale. */
export function activeProfile(settings: Settings): EquipmentProfile {
  const all = profilesOf(settings)
  return all.find((p) => p.id === settings.activeProfileId) ?? all[0]
}

/**
 * Settings as the engines should see them: the active profile's equipment
 * mirrored onto the flat `barWeightKg`/`platesKg` fields. Doing the resolution
 * once, at the top of the app, means plate math, warm-up ramps and suggestion
 * rounding need no idea profiles exist.
 */
export function applyActiveProfile(settings: Settings): Settings {
  const profile = activeProfile(settings)
  if (settings.barWeightKg === profile.barWeightKg && settings.platesKg === profile.platesKg) {
    return settings
  }
  return { ...settings, barWeightKg: profile.barWeightKg, platesKg: profile.platesKg }
}

/** Exercise ids the active gym can't do. */
export function unavailableAt(settings: Settings): Set<string> {
  return new Set(activeProfile(settings).unavailable ?? [])
}

/**
 * Sessions carry the profile they were logged under. Nothing recomputes past
 * plate math from it — logged weights are what was lifted, whatever the room —
 * but it keeps the record honest about where the work happened.
 */
export function profileOfSession(session: Session, settings: Settings): EquipmentProfile | undefined {
  if (!session.profileId) return undefined
  return profilesOf(settings).find((p) => p.id === session.profileId)
}

/** Parse a comma/space separated plate list into a clean descending set. */
export function parsePlates(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a)
}
