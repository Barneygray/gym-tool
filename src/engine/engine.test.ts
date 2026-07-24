import { describe, it, expect } from 'vitest'
import type { Session, SetLog } from '../types'
import { getExercise } from '../data/exercises'
import { dayById } from '../data/days'
import { DEFAULT_SETTINGS } from '../db/db'
import { suggestFor } from './progression'
import { isStalled } from './stall'
import { generateWorkout, swapOptions } from './rotation'
import { platesPerSide, roundToLoadable } from './plates'
import { warmupRamp } from './warmup'
import { e1rm, newPRsInSession, recoveryByMuscle, volumeByMuscle } from './stats'
import { planSessionSync, syncStamp, type RemoteMeta } from './syncPlan'
import { recommendDay } from './coach'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

let nextStart = NOW - 90 * DAY
function session(dayType: Session['dayType'], exerciseId: string, sets: SetLog[], startedAt?: number): Session {
  const t = startedAt ?? (nextStart += DAY)
  return { uuid: crypto.randomUUID(), dayType, startedAt: t, finishedAt: t + 3_600_000, entries: [{ exerciseId, sets }] }
}

const bench = getExercise('bench-press') // range 5–8, +2.5 kg

describe('progression (double progression)', () => {
  it('prompts a conservative start for a never-done exercise', () => {
    const s = suggestFor(bench, [], DEFAULT_SETTINGS)
    expect(s.kind).toBe('start')
    expect(s.targetReps).toBe(5)
  })

  it('bumps weight when every set tops the rep range', () => {
    const history = [session('push', 'bench-press', [
      { weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    ])]
    const s = suggestFor(bench, history, DEFAULT_SETTINGS)
    expect(s.kind).toBe('increase')
    expect(s.weight).toBe(82.5)
    expect(s.targetReps).toBe(5)
  })

  it('doubles the jump when topping the range felt easy (avg RPE ≤ 7)', () => {
    const history = [session('push', 'bench-press', [
      { weight: 80, reps: 8, rpe: 6 }, { weight: 80, reps: 8, rpe: 7 }, { weight: 80, reps: 8, rpe: 7 },
    ])]
    const s = suggestFor(bench, history, DEFAULT_SETTINGS)
    expect(s.weight).toBe(85)
  })

  it('holds the weight and targets one more rep otherwise', () => {
    const history = [session('push', 'bench-press', [
      { weight: 80, reps: 8 }, { weight: 80, reps: 6 }, { weight: 80, reps: 5 },
    ])]
    const s = suggestFor(bench, history, DEFAULT_SETTINGS)
    expect(s.kind).toBe('build')
    expect(s.weight).toBe(80)
    expect(s.targetReps).toBe(6)
  })

  it('ignores warm-up-weight sets when judging the top weight', () => {
    const history = [session('push', 'bench-press', [
      { weight: 60, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    ])]
    const s = suggestFor(bench, history, DEFAULT_SETTINGS)
    expect(s.kind).toBe('increase')
    expect(s.weight).toBe(82.5)
  })

  it('suggests a ~10% deload after three stalled sessions', () => {
    const flat: SetLog[] = [{ weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 6 }]
    const history = [
      session('push', 'bench-press', flat),
      session('push', 'bench-press', flat),
      session('push', 'bench-press', flat),
    ]
    const s = suggestFor(bench, history, DEFAULT_SETTINGS)
    expect(s.kind).toBe('deload')
    expect(s.weight).toBe(70) // 72 rounded down to the loadable 2.5 kg step
  })
})

describe('stall detection', () => {
  const flat: SetLog[] = [{ weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 6 }]

  it('needs three performances', () => {
    expect(isStalled('bench-press', [session('push', 'bench-press', flat), session('push', 'bench-press', flat)])).toBe(false)
  })

  it('flags three identical sessions', () => {
    const h = [session('push', 'bench-press', flat), session('push', 'bench-press', flat), session('push', 'bench-press', flat)]
    expect(isStalled('bench-press', h)).toBe(true)
  })

  it('does not flag when reps crept up', () => {
    const h = [
      session('push', 'bench-press', flat),
      session('push', 'bench-press', flat),
      session('push', 'bench-press', [{ weight: 80, reps: 7 }, { weight: 80, reps: 6 }, { weight: 80, reps: 6 }]),
    ]
    expect(isStalled('bench-press', h)).toBe(false)
  })
})

describe('rotation', () => {
  const push = dayById.get('push')!

  it('picks one exercise per slot with no duplicates', () => {
    const w = generateWorkout(push, [])
    expect(w).toHaveLength(push.slots.length)
    expect(new Set(w).size).toBe(w.length)
  })

  it('alternates variations: what you did last time ranks last', () => {
    const first = generateWorkout(push, [])
    expect(first[0]).toBe('bench-press')
    const history = [session('push', 'bench-press', [{ weight: 80, reps: 8 }])]
    const next = generateWorkout(push, history)
    expect(next[0]).not.toBe('bench-press')
  })

  it('offers same-variation-group swaps first, then same-muscle', () => {
    const options = swapOptions('bench-press', ['bench-press'])
    expect(options[0]).toBe('db-bench-press')
    expect(options).toContain('cable-fly')
    expect(options).not.toContain('bench-press')
  })
})

describe('plates & warm-ups', () => {
  it('breaks a weight into per-side plates', () => {
    expect(platesPerSide(100, 20, DEFAULT_SETTINGS.platesKg)).toEqual([25, 15])
    expect(platesPerSide(82.5, 20, DEFAULT_SETTINGS.platesKg)).toEqual([25, 5, 1.25])
  })

  it('returns null for unloadable weights', () => {
    expect(platesPerSide(81, 20, DEFAULT_SETTINGS.platesKg)).toBeNull()
    expect(platesPerSide(15, 20, DEFAULT_SETTINGS.platesKg)).toBeNull()
  })

  it('rounds to loadable', () => {
    expect(roundToLoadable(81, 20, DEFAULT_SETTINGS.platesKg)).toBe(80)
  })

  it('ramps a barbell compound from the empty bar', () => {
    const ramp = warmupRamp(bench, 100, DEFAULT_SETTINGS)
    expect(ramp[0]).toEqual({ weight: 20, reps: 10, label: 'Empty bar' })
    expect(ramp.map((r) => r.weight)).toEqual([20, 40, 60, 80])
  })

  it('skips ramps for isolation moves', () => {
    expect(warmupRamp(getExercise('lateral-raise'), 12, DEFAULT_SETTINGS)).toEqual([])
  })
})

describe('stats', () => {
  it('computes Epley e1RM', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(80, 6)).toBeCloseTo(96)
  })

  it('detects new PRs in a session', () => {
    const old = session('push', 'bench-press', [{ weight: 80, reps: 6 }])
    const fresh = session('push', 'bench-press', [{ weight: 85, reps: 5 }])
    const prs = newPRsInSession(fresh, [old, fresh])
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ exerciseId: 'bench-press', kind: 'weight', weight: 85 })
  })

  it('tracks per-muscle recovery from primary and secondary muscles', () => {
    const h = [session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - 2 * DAY)]
    const rec = recoveryByMuscle(h, NOW)
    expect(rec.get('chest')).toBeCloseTo(2)
    expect(rec.get('triceps')).toBeCloseTo(2)
    expect(rec.get('quads')).toBe(Infinity)
  })

  it('sums tonnage per muscle with half-credit for secondaries', () => {
    const h = [session('push', 'bench-press', [{ weight: 100, reps: 10 }], NOW - DAY)]
    const vol = volumeByMuscle(h, NOW - 7 * DAY, NOW)
    expect(vol.get('chest')).toBe(1000)
    expect(vol.get('triceps')).toBe(500)
  })
})

describe('cloud sync planning', () => {
  const a = session('push', 'bench-press', [{ weight: 80, reps: 6 }])
  const b = session('pull', 'barbell-row', [{ weight: 60, reps: 8 }])
  const meta = (...s: Session[]): RemoteMeta[] => s.map((x) => ({ uuid: x.uuid, updatedAt: syncStamp(x) }))

  it('pushes local sessions the cloud does not have yet', () => {
    const { toPush, toPullUuids } = planSessionSync([a, b], meta(a))
    expect(toPush).toEqual([b])
    expect(toPullUuids).toEqual([])
  })

  it('pulls cloud sessions missing locally', () => {
    const { toPush, toPullUuids } = planSessionSync([a], meta(a, b))
    expect(toPush).toEqual([])
    expect(toPullUuids).toEqual([b.uuid])
  })

  it('is a no-op once both sides match', () => {
    const { toPush, toPullUuids } = planSessionSync([a, b], meta(a, b))
    expect(toPush).toEqual([])
    expect(toPullUuids).toEqual([])
  })

  it('pushes a locally edited session the cloud has an older copy of', () => {
    const edited: Session = { ...a, entries: [{ exerciseId: 'bench-press', sets: [{ weight: 85, reps: 6 }] }], updatedAt: syncStamp(a) + 10_000 }
    const { toPush, toPullUuids } = planSessionSync([edited, b], meta(a, b))
    expect(toPush).toEqual([edited])
    expect(toPullUuids).toEqual([])
  })

  it('pulls a remotely edited session that is newer than local', () => {
    const remote: RemoteMeta[] = [{ uuid: a.uuid, updatedAt: syncStamp(a) + 10_000 }, ...meta(b)]
    const { toPush, toPullUuids } = planSessionSync([a, b], remote)
    expect(toPush).toEqual([])
    expect(toPullUuids).toEqual([a.uuid])
  })

  it('pushes a local deletion (tombstone) as a newer write', () => {
    const tombstone: Session = { ...a, deletedAt: syncStamp(a) + 5_000, updatedAt: syncStamp(a) + 5_000 }
    const { toPush } = planSessionSync([tombstone], meta(a))
    expect(toPush).toEqual([tombstone])
  })
})

describe('coach recommendation', () => {
  it('recommends a clean start with no history', () => {
    const rec = recommendDay([], NOW)
    expect(rec.dayType).toBeDefined()
    expect(rec.reason).toMatch(/fresh/i)
    expect(rec.overdue).toEqual([])
  })

  it('steers toward the day whose muscles are most rested', () => {
    // Trained chest/back/arms/delts today; every leg muscle untouched → legs wins.
    const history = [
      session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - 12 * 3600_000),
      session('pull', 'barbell-row', [{ weight: 60, reps: 8 }], NOW - 12 * 3600_000),
    ]
    const rec = recommendDay(history, NOW)
    expect(rec.dayType).toBe('legs')
  })

  it('flags muscles gone stale for a week', () => {
    const history = [session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - 9 * DAY)]
    const rec = recommendDay(history, NOW)
    expect(rec.overdue).toContain('chest')
  })
})
