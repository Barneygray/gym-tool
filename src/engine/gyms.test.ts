import { describe, it, expect } from 'vitest'
import type { Session, SetLog, Settings } from '../types'
import { MOBILITY } from '../types'
import { DEFAULT_SETTINGS } from '../db/db'
import {
  DEFAULT_PROFILE_ID, activeProfile, applyActiveProfile, makeProfile, parsePlates, profileOfSession,
  profilesOf,
} from './equipment'
import {
  STALE_AFTER, daysSinceStretched, groupsForMuscles, isGymSession, isMobilitySession,
  lastStretchedByGroup, staleGroups,
} from './mobility'
import { trainedToday } from './reminder'
import { roundToLoadable } from './plates'
import { suggestFor } from './progression'
import { getExercise } from '../data/exercises'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

function session(dayType: Session['dayType'], exerciseId: string, sets: SetLog[], startedAt: number): Session {
  return { uuid: crypto.randomUUID(), dayType, startedAt, finishedAt: startedAt + 3_600_000, entries: [{ exerciseId, sets }] }
}

const stretched = (stretchId: string, startedAt: number) =>
  session(MOBILITY, stretchId, [{ weight: 0, reps: 1 }], startedAt)

// ── Equipment profiles ──────────────────────────────────
describe('equipment profiles', () => {
  const home = makeProfile({ id: 'home', name: 'Home rack', barWeightKg: 20, platesKg: [20, 10, 5, 2.5] })
  const hotel = makeProfile({ id: 'hotel', name: 'Hotel gym', barWeightKg: 15, platesKg: [10, 5, 2.5] })

  it('synthesises one implicit profile when none are configured', () => {
    const all = profilesOf(DEFAULT_SETTINGS)
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(DEFAULT_PROFILE_ID)
    expect(all[0].platesKg).toEqual(DEFAULT_SETTINGS.platesKg)
  })

  it('sorts plates descending, so the greedy plate maths stays correct', () => {
    expect(makeProfile({ name: 'x', platesKg: [2.5, 20, 10] }).platesKg).toEqual([20, 10, 2.5])
    expect(parsePlates('2.5, 20 10,,rubbish,-5')).toEqual([20, 10, 2.5])
  })

  it('falls back to the first profile when the active id is stale', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, profiles: [home, hotel], activeProfileId: 'deleted' }
    expect(activeProfile(settings).id).toBe('home')
  })

  it('mirrors the active gym onto the flat fields the engines read', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, profiles: [home, hotel], activeProfileId: 'hotel' }
    const equipped = applyActiveProfile(settings)
    expect(equipped.barWeightKg).toBe(15)
    expect(equipped.platesKg).toEqual([10, 5, 2.5])
  })

  it('changes which weights are loadable — the whole point', () => {
    // 82.5 needs a 1.25 per side off a 20 kg bar; neither gym below has one.
    expect(roundToLoadable(82.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toBe(82.5)
    expect(roundToLoadable(82.5, 20, home.platesKg)).toBe(80)
    expect(roundToLoadable(82.5, 15, hotel.platesKg)).toBe(80)
  })

  it('a suggestion re-rounds to the gym you switched to', () => {
    const bench = getExercise('bench-press') // tops out at 8 reps, +2.5 kg
    const topped = [session('push', 'bench-press', [
      { weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    ], NOW - DAY)]
    const at = (profile: typeof home) =>
      suggestFor(bench, topped, applyActiveProfile({
        ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id,
      })).weight

    const light = makeProfile({ id: 'light', name: 'Light', barWeightKg: 20, platesKg: [20, 10, 5] })
    // A gym with nothing smaller than 5 kg plates can't make 82.5 at all.
    expect(at(light) % 10).toBe(0)
    expect(at(home)).toBeGreaterThanOrEqual(80)
  })

  it('resolves the gym a session was logged at, and shrugs when it is gone', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, profiles: [home, hotel], activeProfileId: 'home' }
    const s = { ...session('push', 'bench-press', [], NOW), profileId: 'hotel' }
    expect(profileOfSession(s, settings)?.name).toBe('Hotel gym')
    expect(profileOfSession({ ...s, profileId: 'gone' }, settings)).toBeUndefined()
    expect(profileOfSession(session('push', 'bench-press', [], NOW), settings)).toBeUndefined()
  })
})

// ── Mobility ────────────────────────────────────────────
describe('mobility tracking', () => {
  it('separates training from conditioning and mobility', () => {
    expect(isGymSession(session('push', 'bench-press', [], NOW))).toBe(true)
    expect(isGymSession(session('conditioning', 'kb-swing', [], NOW))).toBe(false)
    expect(isGymSession(stretched('doorway-pec', NOW))).toBe(false)
    expect(isMobilitySession(stretched('doorway-pec', NOW))).toBe(true)
  })

  it('stretching does not count as having trained today', () => {
    // Otherwise a morning mobility session suppresses the training reminder.
    expect(trainedToday([stretched('doorway-pec', NOW)], NOW)).toBe(false)
    expect(trainedToday([session('push', 'bench-press', [], NOW)], NOW)).toBe(true)
  })

  it('tracks staleness per stretch group, not per stretch', () => {
    const h = [stretched('doorway-pec', NOW - 3 * DAY)]
    expect(lastStretchedByGroup(h).get('chest-shoulders')).toBe(NOW - 3 * DAY)
    const since = daysSinceStretched(h, NOW)
    expect(since.get('chest-shoulders')).toBeCloseTo(3)
    expect(since.get('legs-glutes')).toBe(Infinity)
  })

  it('only nags about muscles actually being trained', () => {
    // Chest trained, legs never — so chest mobility is overdue, legs isn't.
    const h = [session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 2 * DAY)]
    const stale = staleGroups(h, NOW)
    expect(stale).toContain('chest-shoulders')
    expect(stale).not.toContain('legs-glutes')
  })

  it('stops nagging once the group has been stretched', () => {
    const h = [
      session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 2 * DAY),
      stretched('doorway-pec', NOW - 1 * DAY),
    ]
    expect(staleGroups(h, NOW)).not.toContain('chest-shoulders')
    // …and starts again once it goes stale.
    const older = [
      session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 2 * DAY),
      stretched('doorway-pec', NOW - (STALE_AFTER + 1) * DAY),
    ]
    expect(staleGroups(older, NOW)).toContain('chest-shoulders')
  })

  it('desk-rescue groups are nagged about regardless of what you train', () => {
    expect(staleGroups([session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW)], NOW))
      .toContain('lower-back')
  })

  it('offers the groups covering what was just trained, stalest first', () => {
    const h = [stretched('doorway-pec', NOW - DAY)] // chest recently done
    const groups = groupsForMuscles(['chest', 'shoulders'], h, NOW)
    expect(groups).toContain('chest-shoulders')
    // A group never stretched outranks one done yesterday.
    expect(groups[0]).not.toBe('chest-shoulders')
  })

  it('offers nothing for muscles with no matching group', () => {
    expect(groupsForMuscles([], [], NOW)).toEqual([])
  })
})
