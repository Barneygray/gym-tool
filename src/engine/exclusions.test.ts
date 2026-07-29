import { describe, it, expect } from 'vitest'
import type { Session, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../db/db'
import { dayById } from '../data/days'
import { getExercise } from '../data/exercises'
import { makeProfile } from './equipment'
import { excludedIds, isExcluded, toggleExcluded } from './exclusions'
import { generateWorkout, swapOptions } from './rotation'

const pull = dayById.get('pull')!
const legs = dayById.get('legs')!
const NO_HISTORY: Session[] = []

const withExcluded = (...ids: string[]): Settings => ({ ...DEFAULT_SETTINGS, excluded: ids })

describe('the never-prescribe list', () => {
  it('starts empty, and toggling adds then removes', () => {
    expect(excludedIds(DEFAULT_SETTINGS).size).toBe(0)
    const on = toggleExcluded(DEFAULT_SETTINGS, 'deadlift')
    expect(on).toEqual(['deadlift'])
    expect(isExcluded({ ...DEFAULT_SETTINGS, excluded: on }, 'deadlift')).toBe(true)
    expect(toggleExcluded({ ...DEFAULT_SETTINGS, excluded: on }, 'deadlift')).toEqual([])
  })

  it('unions the lifts you never do with the kit this gym hasn’t got', () => {
    const settings: Settings = {
      ...withExcluded('deadlift'),
      profiles: [makeProfile({ id: 'hotel', name: 'Hotel gym', unavailable: ['hip-thrust'] })],
      activeProfileId: 'hotel',
    }
    expect([...excludedIds(settings)].sort()).toEqual(['deadlift', 'hip-thrust'])
    // …but only the first kind is a standing decision about the lift itself.
    expect(isExcluded(settings, 'hip-thrust')).toBe(false)
  })
})

describe('rotation with exclusions', () => {
  it('leaves the workout untouched when nothing is excluded', () => {
    expect(generateWorkout(pull, NO_HISTORY, excludedIds(DEFAULT_SETTINGS)))
      .toEqual(generateWorkout(pull, NO_HISTORY))
  })

  it('never picks an excluded lift, taking the rest of its pool instead', () => {
    const workout = generateWorkout(pull, NO_HISTORY, excludedIds(withExcluded('deadlift')))
    expect(workout).not.toContain('deadlift')
    // The back slot deadlift used to fill is still filled — by its pool sibling.
    expect(workout).toContain('barbell-row')
    expect(workout).toHaveLength(pull.slots.length)
  })

  it('stands a slot back up when its whole pool is excluded', () => {
    // Legs has a hamstrings slot whose pool is the RDL alone. Excluding it must
    // cost the day a hinge, not a whole slot — the muscle is still owed work.
    const workout = generateWorkout(legs, NO_HISTORY, excludedIds(withExcluded('romanian-deadlift')))
    expect(workout).not.toContain('romanian-deadlift')
    expect(workout).toHaveLength(legs.slots.length)
    expect(new Set(workout).size).toBe(workout.length)
    expect(workout.filter((id) => getExercise(id).primary === 'hamstrings')).toHaveLength(2)
  })

  it('drops the slot only when nothing at all can train the muscle', () => {
    const banned = ['romanian-deadlift', 'lying-leg-curl', 'seated-leg-curl']
    const workout = generateWorkout(legs, NO_HISTORY, excludedIds(withExcluded(...banned)))
    expect(workout.filter((id) => getExercise(id).primary === 'hamstrings')).toHaveLength(0)
    expect(workout).toHaveLength(legs.slots.length - 2)
  })

  it('keeps an excluded lift out of the swap options it would otherwise head', () => {
    // Same variation group as the RDL, so it leads the list until excluded.
    expect(swapOptions('deadlift', ['deadlift'])).toContain('romanian-deadlift')
    const options = swapOptions('deadlift', ['deadlift'], excludedIds(withExcluded('romanian-deadlift')))
    expect(options).not.toContain('romanian-deadlift')
    expect(options.length).toBeGreaterThan(0)
  })
})
