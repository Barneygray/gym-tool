import { describe, it, expect, afterEach } from 'vitest'
import type { Session, SetLog } from '../types'
import {
  getExercise, registerCustomExercises, makeCustomExercise, exerciseById, EXERCISES, isBodyweightLoaded,
} from '../data/exercises'
import { swapOptions } from './rotation'
import { weeklySetsByMuscle, volumeStatus, underVolumeMuscles, MUSCLE_TARGETS } from './volume'
import { bodyweightAt, latestBodyweight } from './bodyweight'
import { effectiveLoad, prsFor, e1rmTrend, volumeByMuscle } from './stats'
import { recommendDay } from './coach'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

let seq = NOW - 90 * DAY
function session(dayType: Session['dayType'], exerciseId: string, sets: SetLog[], startedAt?: number): Session {
  const t = startedAt ?? (seq += DAY)
  return { uuid: crypto.randomUUID(), dayType, startedAt: t, finishedAt: t + 3_600_000, entries: [{ exerciseId, sets }] }
}

// Keep the shared exercise registry clean between tests that register customs.
afterEach(() => registerCustomExercises([]))

describe('weekly hard-set volume', () => {
  it('counts a set fully for the primary and half for each secondary', () => {
    // bench-press: primary chest, secondary triceps + shoulders.
    const h = [session('push', 'bench-press', [
      { weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 6 },
    ], NOW - DAY)]
    const sets = weeklySetsByMuscle(h, NOW - 7 * DAY, NOW + 1)
    expect(sets.get('chest')).toBe(3)
    expect(sets.get('triceps')).toBe(1.5)
    expect(sets.get('shoulders')).toBe(1.5)
  })

  it('ignores sets with no reps and out-of-window sessions', () => {
    const h = [
      session('push', 'bench-press', [{ weight: 80, reps: 0 }], NOW - DAY),
      session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - 30 * DAY),
    ]
    const sets = weeklySetsByMuscle(h, NOW - 7 * DAY, NOW + 1)
    expect(sets.get('chest') ?? 0).toBe(0)
  })

  it('classifies against the MEV/MRV band', () => {
    expect(volumeStatus('chest', 0)).toBe('none')
    expect(volumeStatus('chest', MUSCLE_TARGETS.chest.mev - 1)).toBe('under')
    expect(volumeStatus('chest', MUSCLE_TARGETS.chest.mev)).toBe('optimal')
    expect(volumeStatus('chest', MUSCLE_TARGETS.chest.mrv + 1)).toBe('high')
  })

  it('flags trained-but-under-dosed muscles, not untrained ones', () => {
    // One chest set this week — below chest MEV, but quads never trained.
    const h = [session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - DAY)]
    const under = underVolumeMuscles(h, NOW)
    expect(under).toContain('chest')
    expect(under).not.toContain('quads')
  })
})

describe('bodyweight resolver', () => {
  const log = [{ at: NOW - 10 * DAY, kg: 80 }, { at: NOW - 2 * DAY, kg: 82 }]

  it('returns the most recent reading at or before a time', () => {
    const at = bodyweightAt(log)
    expect(at(NOW)).toBe(82)
    expect(at(NOW - 5 * DAY)).toBe(80)
  })

  it('falls back to the earliest reading before the log starts', () => {
    expect(bodyweightAt(log)(NOW - 100 * DAY)).toBe(80)
  })

  it('returns 0 with no log, and latest returns null', () => {
    expect(bodyweightAt([])(NOW)).toBe(0)
    expect(latestBodyweight([])).toBeNull()
    expect(latestBodyweight(log)).toBe(82)
  })
})

describe('bodyweight-aware load', () => {
  const bwAt = bodyweightAt([{ at: NOW - 30 * DAY, kg: 80 }])

  it('adds bodyweight for bodyweight-loaded lifts only', () => {
    // pull-up is bodyweight-loaded; bench-press is not.
    expect(effectiveLoad('pull-up', { weight: 10, reps: 5 }, NOW, bwAt)).toBe(90)
    expect(effectiveLoad('bench-press', { weight: 80, reps: 5 }, NOW, bwAt)).toBe(80)
  })

  it('defaults to added weight only when no resolver is given', () => {
    expect(effectiveLoad('pull-up', { weight: 10, reps: 5 }, NOW)).toBe(10)
  })

  it('PRs and e1RM for a bodyweight lift reflect total load', () => {
    const h = [session('pull', 'pull-up', [{ weight: 20, reps: 5 }], NOW - DAY)]
    const pr = prsFor('pull-up', h, bwAt)
    expect(pr.maxWeight?.weight).toBe(100) // 80 bw + 20 added
    const trend = e1rmTrend('pull-up', h, bwAt)
    expect(trend[0].e1rm).toBeCloseTo(100 * (1 + 5 / 30))
  })

  it('adds bodyweight into tonnage for bodyweight lifts', () => {
    const h = [session('pull', 'pull-up', [{ weight: 0, reps: 10 }], NOW - DAY)]
    const vol = volumeByMuscle(h, NOW - 7 * DAY, NOW + 1, bwAt)
    expect(vol.get('back')).toBe(800) // (80 + 0) × 10
  })
})

describe('custom exercises', () => {
  it('registers into the live catalog and ignores built-in id collisions', () => {
    const custom = makeCustomExercise({ id: 'custom-x', name: 'My Machine Row', primary: 'back', equipment: 'machine' })
    const collide = makeCustomExercise({ id: 'bench-press', name: 'Hijack', primary: 'chest', equipment: 'barbell' })
    registerCustomExercises([custom, collide])
    expect(exerciseById.get('custom-x')?.name).toBe('My Machine Row')
    expect(EXERCISES.some((e) => e.id === 'custom-x')).toBe(true)
    // built-in id is not overwritten by a custom entry
    expect(getExercise('bench-press').name).toBe('Barbell Bench Press')
  })

  it('sets barLoaded from equipment and defaults a rep range', () => {
    const bb = makeCustomExercise({ name: 'Landmine Press', primary: 'shoulders', equipment: 'barbell' })
    expect(bb.barLoaded).toBe(true)
    expect(isBodyweightLoaded(makeCustomExercise({ name: 'Ring Dip', primary: 'chest', equipment: 'bodyweight' }))).toBe(true)
    expect(bb.repRange).toEqual([8, 12])
  })

  it('a custom same-muscle lift appears as a swap option once registered', () => {
    registerCustomExercises([
      makeCustomExercise({ id: 'custom-chest', name: 'Smith Incline', primary: 'chest', equipment: 'machine' }),
    ])
    expect(swapOptions('bench-press', ['bench-press'])).toContain('custom-chest')
  })
})

describe('coach surfaces under-volume', () => {
  it('includes an underVolume list in the recommendation', () => {
    const h = [session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - DAY)]
    const rec = recommendDay(h, NOW)
    expect(Array.isArray(rec.underVolume)).toBe(true)
    expect(rec.underVolume).toContain('chest')
  })
})
