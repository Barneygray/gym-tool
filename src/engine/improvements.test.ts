import { describe, it, expect, afterEach } from 'vitest'
import type { Session, SetLog, Settings } from '../types'
import { DEFAULT_SETTINGS, parseBackup } from '../db/db'
import { getExercise, makeCustomExercise, registerCustomExercises } from '../data/exercises'
import { makeCustomDay, registerCustomDays } from '../data/days'
import {
  autoWeekPlan, defaultSplit, resolveWeekPlan, rotationStart, sanitizeWeekPlan, shortDayLabel,
  weeklyPlan,
} from './schedule'
import { readinessEffect } from './readiness'
import { recentAvgRpe, rpeMultiplier, suggestFor } from './progression'
import { isStalled, madeProgress } from './stall'
import { performancesOf } from './history'
import { bodyweightAt } from './bodyweight'
import { planSync, recordStamp } from './syncPlan'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

function session(dayType: Session['dayType'], exerciseId: string, sets: SetLog[], startedAt: number): Session {
  return {
    uuid: crypto.randomUUID(),
    dayType,
    startedAt,
    finishedAt: startedAt + 3_600_000,
    entries: [{ exerciseId, sets }],
  }
}

// Registries are module-level singletons; keep them clean between tests.
afterEach(() => {
  registerCustomExercises([])
  registerCustomDays([])
})

// ── Program-aware weekly plan ───────────────────────────
describe('program-aware weekly plan', () => {
  const upper = makeCustomDay({
    id: 'day-upper',
    name: 'Upper Body A',
    slots: [{ muscle: 'chest', pool: ['bench-press'] }],
  })

  it('lays a custom day into the week, which the built-in split never could', () => {
    registerCustomDays([upper])
    const plan: (string | null)[] = ['day-upper', null, 'push', null, 'day-upper', null, null]
    const laid = weeklyPlan(NOW, 4, 0, plan)
    expect(laid.map((d) => d.dayType)).toEqual(plan)
    expect(laid.filter((d) => d.dayType).length).toBe(3)
  })

  it('sanitize keeps known days and turns unknown ids into rest', () => {
    registerCustomDays([upper])
    expect(sanitizeWeekPlan(['day-upper', 'push', null, null, null, null, null]))
      .toEqual(['day-upper', 'push', null, null, null, null, null])
    // A day deleted since the plan was built must not leave a ghost behind.
    expect(sanitizeWeekPlan(['day-gone', 'push', null, null, null, null, null]))
      .toEqual([null, 'push', null, null, null, null, null])
  })

  it('rejects plans of the wrong length or with nothing scheduled', () => {
    expect(sanitizeWeekPlan(['push', null])).toBeNull()
    expect(sanitizeWeekPlan(null)).toBeNull()
    expect(sanitizeWeekPlan([null, null, null, null, null, null, null])).toBeNull()
  })

  it('resolveWeekPlan prefers a hand-built plan and falls back to the automatic one', () => {
    registerCustomDays([upper])
    const custom: Settings = {
      ...DEFAULT_SETTINGS,
      weekPlan: ['day-upper', null, null, null, null, null, null],
    }
    expect(resolveWeekPlan(custom, [])[0]).toBe('day-upper')
    expect(resolveWeekPlan({ ...DEFAULT_SETTINGS, weeklyFrequency: 3 }, [])).toEqual(autoWeekPlan(3, 0))
  })

  it('an off-plan session no longer resets the rotation to the top of the week', () => {
    const split = defaultSplit(4) // push, pull, legs, shoulders-arms
    const history = [
      session('pull', 'bench-press', [{ weight: 60, reps: 5 }], NOW - 3 * DAY),
      // A freestyle session logged more recently is not in the split.
      session('freestyle', 'bench-press', [{ weight: 60, reps: 5 }], NOW - DAY),
    ]
    // Resumes after 'pull' (index 1) rather than restarting at 0.
    expect(rotationStart(history, split)).toBe(2)
    expect(rotationStart([session('conditioning', 'bench-press', [], NOW)], split)).toBe(0)
  })

  it('shortens custom day names to fit the week strip', () => {
    registerCustomDays([upper, makeCustomDay({ id: 'day-legs2', name: 'Legs B', slots: [] })])
    expect(shortDayLabel('push')).toBe('Push')
    expect(shortDayLabel('day-legs2')).toBe('Legs B')
    expect(shortDayLabel('day-upper')).toBe('UBA') // initials when the name is too long
  })
})

// ── Readiness autoregulation ────────────────────────────
describe('readiness', () => {
  const bench = getExercise('bench-press') // 5–8 reps, +2.5 kg
  const topped = [
    session('push', 'bench-press', [
      { weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    ], NOW - DAY),
  ]

  it('describes each level, and nothing at all when unset', () => {
    expect(readinessEffect(null)).toBeNull()
    expect(readinessEffect('normal')?.setBias).toBe(0)
    expect(readinessEffect('normal')?.intensity).toBe(1)
    expect(readinessEffect('fresh')?.setBias).toBe(1)
    expect(readinessEffect('beat')?.intensity).toBeLessThan(1)
  })

  it('a bad day trims a set and backs the load off', () => {
    const base = suggestFor(bench, topped, DEFAULT_SETTINGS)
    const beat = suggestFor(bench, topped, DEFAULT_SETTINGS, null, { readiness: 'beat' })
    expect(beat.sets).toBe(base.sets - 1)
    expect(beat.weight).toBeLessThan(base.weight)
  })

  it('a good day adds a set without inflating the load', () => {
    const base = suggestFor(bench, topped, DEFAULT_SETTINGS)
    const fresh = suggestFor(bench, topped, DEFAULT_SETTINGS, null, { readiness: 'fresh' })
    expect(fresh.sets).toBe(base.sets + 1)
    expect(fresh.weight).toBe(base.weight)
  })

  it("'normal' leaves the prescription exactly as it was", () => {
    const base = suggestFor(bench, topped, DEFAULT_SETTINGS)
    const normal = suggestFor(bench, topped, DEFAULT_SETTINGS, null, { readiness: 'normal' })
    expect(normal.sets).toBe(base.sets)
    expect(normal.weight).toBe(base.weight)
  })
})

// ── Multi-session RPE ───────────────────────────────────
describe('RPE-scaled progression', () => {
  const bench = getExercise('bench-press')

  it('scales the jump continuously instead of flipping one switch', () => {
    expect(rpeMultiplier(null)).toBe(1)
    expect(rpeMultiplier(6.5)).toBe(2)
    expect(rpeMultiplier(7.5)).toBe(1.5)
    expect(rpeMultiplier(8.5)).toBe(1)
    expect(rpeMultiplier(9.5)).toBe(0.5)
  })

  it('averages RPE across recent sessions, ignoring untagged sets', () => {
    const history = [
      session('push', 'bench-press', [{ weight: 80, reps: 8, rpe: 7 }, { weight: 80, reps: 8 }], NOW - DAY),
      session('push', 'bench-press', [{ weight: 80, reps: 8, rpe: 9 }], NOW - 4 * DAY),
    ]
    expect(recentAvgRpe(performancesOf('bench-press', history))).toBe(8)
    expect(recentAvgRpe(performancesOf('bench-press', []))).toBeNull()
  })

  it('a grinding top-of-range session earns a smaller jump than an easy one', () => {
    const hard = [session('push', 'bench-press', [
      { weight: 80, reps: 8, rpe: 10 }, { weight: 80, reps: 8, rpe: 10 }, { weight: 80, reps: 8, rpe: 10 },
    ], NOW - DAY)]
    const easy = [session('push', 'bench-press', [
      { weight: 80, reps: 8, rpe: 6 }, { weight: 80, reps: 8, rpe: 6 }, { weight: 80, reps: 8, rpe: 6 },
    ], NOW - DAY)]
    expect(suggestFor(bench, hard, DEFAULT_SETTINGS).weight)
      .toBeLessThan(suggestFor(bench, easy, DEFAULT_SETTINGS).weight)
  })

  it('two hard sets can still top the range when only two were worked', () => {
    // Previously the jump required three top sets outright, so a deload week's
    // two crisp sets could never earn one.
    const twoSets = [session('push', 'bench-press', [
      { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    ], NOW - DAY)]
    expect(suggestFor(bench, twoSets, DEFAULT_SETTINGS).kind).toBe('increase')
  })
})

// ── Bodyweight-aware stall detection ────────────────────
describe('bodyweight-aware progress', () => {
  // Same reps at the same added load, but 4 kg heavier by the last session.
  const pullups = [
    session('pull', 'pull-up', [{ weight: 0, reps: 8 }], NOW - 14 * DAY),
    session('pull', 'pull-up', [{ weight: 0, reps: 8 }], NOW - 7 * DAY),
    session('pull', 'pull-up', [{ weight: 0, reps: 8 }], NOW - DAY),
  ]
  const gaining = bodyweightAt([
    { at: NOW - 15 * DAY, kg: 78 },
    { at: NOW - 8 * DAY, kg: 80 },
    { at: NOW - 2 * DAY, kg: 82 },
  ])

  it('counts a bodyweight gain at equal reps as progress', () => {
    const perfs = performancesOf('pull-up', pullups)
    expect(madeProgress(perfs[0], perfs[1])).toBe(false) // added weight alone: flat
    expect(madeProgress(perfs[0], perfs[1], 'pull-up', gaining)).toBe(true)
  })

  it('no longer calls a heavier trainee stalled for holding their reps', () => {
    expect(isStalled('pull-up', pullups)).toBe(true) // the old, added-weight-only read
    expect(isStalled('pull-up', pullups, gaining)).toBe(false)
  })

  it('still detects a genuine stall at a steady bodyweight', () => {
    const steady = bodyweightAt([{ at: NOW - 30 * DAY, kg: 80 }])
    expect(isStalled('pull-up', pullups, steady)).toBe(true)
    expect(suggestFor(getExercise('pull-up'), pullups, DEFAULT_SETTINGS, null, { bwAt: steady }).kind)
      .toBe('deload')
  })

  it('leaves non-bodyweight lifts judged on the bar alone', () => {
    const flat = [
      session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 14 * DAY),
      session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 7 * DAY),
      session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - DAY),
    ]
    expect(isStalled('bench-press', flat, gaining)).toBe(true)
  })
})

// ── Generic sync planning ───────────────────────────────
describe('generic sync planning', () => {
  it('pushes what the other side lacks or holds stale, pulls what is newer', () => {
    const { pushKeys, pullKeys } = planSync(
      [{ key: 'a', stamp: 5 }, { key: 'b', stamp: 9 }, { key: 'c', stamp: 1 }],
      [{ key: 'b', stamp: 3 }, { key: 'c', stamp: 4 }, { key: 'd', stamp: 7 }],
    )
    expect(pushKeys).toEqual(['a', 'b']) // 'a' missing remotely, 'b' newer locally
    expect(pullKeys).toEqual(['c', 'd']) // 'c' newer remotely, 'd' missing locally
  })

  it('treats an unstamped record as never synced, so it still gets pushed', () => {
    expect(recordStamp({})).toBe(0)
    expect(recordStamp({ updatedAt: 42 })).toBe(42)
    expect(planSync([{ key: 'x', stamp: recordStamp({}) }], []).pushKeys).toEqual(['x'])
  })

  it('a tombstone is just a newer write and flows like any other change', () => {
    const { pushKeys } = planSync(
      [{ key: 'g', stamp: recordStamp({ updatedAt: 20, deletedAt: 20 }) }],
      [{ key: 'g', stamp: 10 }],
    )
    expect(pushKeys).toEqual(['g'])
  })

  it('keys records by kind so ids only need to be unique within a kind', () => {
    const { pushKeys } = planSync(
      [{ key: 'goal:1', stamp: 5 }, { key: 'day:1', stamp: 5 }],
      [{ key: 'goal:1', stamp: 5 }],
    )
    expect(pushKeys).toEqual(['day:1'])
  })
})

// ── Backup validation ───────────────────────────────────
describe('backup validation', () => {
  const valid = JSON.stringify({
    version: 4,
    exportedAt: NOW,
    sessions: [{ uuid: 'u1', dayType: 'push', startedAt: NOW, entries: [] }],
    exercises: [makeCustomExercise({ id: 'custom-1', name: 'Machine Row', primary: 'back', equipment: 'machine' })],
    days: [],
    goals: [],
    bodyweights: [{ at: NOW, kg: 80 }],
  })

  it('accepts a well-formed backup and reports what it holds', () => {
    const parsed = parseBackup(valid)
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.exercises).toHaveLength(1)
    expect(parsed.bodyweights).toHaveLength(1)
  })

  it('rejects junk before anything is cleared', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup('{}')).toThrow()
    expect(() => parseBackup('[]')).toThrow()
    // Right key, wrong shape inside — previously this passed the array check
    // and was written straight into the database.
    expect(() => parseBackup('{"sessions":[{"nope":1}]}')).toThrow()
    expect(() => parseBackup('{"sessions":[],"exercises":[{"id":"x"}]}')).toThrow()
    expect(() => parseBackup('{"sessions":[],"bodyweights":"lots"}')).toThrow()
  })

  it('accepts an empty backup but reports it as empty, so it can be confirmed', () => {
    const parsed = parseBackup('{"sessions":[]}')
    expect(parsed.sessions).toHaveLength(0)
    expect(parsed.exercises).toHaveLength(0)
  })

  it('treats missing optional collections as empty rather than failing', () => {
    expect(parseBackup('{"sessions":[],"goals":null}').goals).toEqual([])
  })
})
