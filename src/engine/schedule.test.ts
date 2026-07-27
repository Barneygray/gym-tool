import { describe, it, expect } from 'vitest'
import type { Session, Settings, SetLog } from '../types'
import { DEFAULT_SETTINGS } from '../db/db'
import {
  clampFrequency, defaultSplit, weeklyPlan, resolveWeekPlan, rotationStart, nextTrainingDay,
  mondayIndex, startOfWeek,
} from './schedule'
import { recommendDay } from './coach'
import { buildSupersets, nextPartner } from './superset'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

function session(dayType: Session['dayType'], startedAt: number): Session {
  const sets: SetLog[] = [{ weight: 80, reps: 5 }]
  return { uuid: crypto.randomUUID(), dayType, startedAt, finishedAt: startedAt + 3_600_000, entries: [{ exerciseId: 'bench-press', sets }] }
}

describe('weekly schedule', () => {
  it('clamps frequency and picks a sensible split', () => {
    expect(clampFrequency(9)).toBe(6)
    expect(clampFrequency(1)).toBe(2)
    expect(defaultSplit(3)).toEqual(['push', 'pull', 'legs'])
    expect(defaultSplit(4)).toEqual(['push', 'pull', 'legs', 'shoulders-arms'])
  })

  it('builds a 7-day Mon–Sun plan with the right number of training days', () => {
    const plan = weeklyPlan(NOW, 4, 0)
    expect(plan).toHaveLength(7)
    expect(plan.filter((d) => d.dayType).length).toBe(4)
    expect(plan.filter((d) => !d.dayType).length).toBe(3)
    expect(plan.filter((d) => d.isToday).length).toBe(1)
    expect(plan.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('assigns templates in split order rotated by the start index', () => {
    const types = weeklyPlan(NOW, 4, 0).filter((d) => d.dayType).map((d) => d.dayType)
    expect(types).toEqual(['push', 'pull', 'legs', 'shoulders-arms'])
    const rotated = weeklyPlan(NOW, 4, 2).filter((d) => d.dayType).map((d) => d.dayType)
    expect(rotated).toEqual(['legs', 'shoulders-arms', 'push', 'pull'])
  })

  it('resumes rotation after the last trained day', () => {
    const split = defaultSplit(4)
    expect(rotationStart([session('push', NOW - DAY)], split)).toBe(1)
    expect(rotationStart([], split)).toBe(0)
    // Conditioning sessions are ignored when resuming the split.
    expect(rotationStart([session('conditioning', NOW)], split)).toBe(0)
  })

  it('finds the next training day at or after today', () => {
    const plan = weeklyPlan(NOW, 4, 0)
    const next = nextTrainingDay(plan)
    expect(next).not.toBeNull()
    expect(next!.date).toBeGreaterThanOrEqual(plan.find((d) => d.isToday)!.date)
  })

  it('mondayIndex maps Monday to 0 (timezone-independent)', () => {
    const monday = Date.UTC(2026, 6, 20)
    expect(mondayIndex(monday)).toBe((new Date(monday).getDay() + 6) % 7)
  })
})

// ── The week holds still while you train it ─────────────
describe('week plan anchoring', () => {
  // Local midnights, so the Monday/Wednesday/Friday slots line up with the
  // weekdays the layout is asserted against whatever zone the tests run in.
  const MONDAY = new Date(2026, 6, 27, 9, 0, 0).getTime()
  const WEDNESDAY = new Date(2026, 6, 29, 9, 0, 0).getTime()
  const LAST_SUNDAY = new Date(2026, 6, 26, 18, 0, 0).getTime()
  const thrice: Settings = { ...DEFAULT_SETTINGS, weeklyFrequency: 3, weekPlan: undefined }

  it('keeps the week put when a session is logged during it', () => {
    // Monday push / Wednesday pull / Friday legs, before anything is logged.
    const empty = resolveWeekPlan(thrice, [], MONDAY)
    expect(empty).toEqual(['push', null, 'pull', null, 'legs', null, null])

    // Logging Monday's push must not rotate the strip: the regression relabelled
    // Monday as pull and shunted push out to Friday, hiding the session just
    // logged and moving two days that had already been decided.
    const afterPush = [session('push', MONDAY)]
    expect(resolveWeekPlan(thrice, afterPush, MONDAY)).toEqual(empty)
    // Still put when the week is looked at again on a later day.
    expect(resolveWeekPlan(thrice, afterPush, WEDNESDAY)).toEqual(empty)
  })

  it('resumes the rotation from the week before, not from this week', () => {
    // Last week finished on push, so this week opens on pull.
    const plan = resolveWeekPlan(thrice, [session('push', LAST_SUNDAY)], MONDAY)
    expect(plan).toEqual(['pull', null, 'legs', null, 'push', null, null])
    // And logging that Monday pull leaves the rest of the week alone.
    expect(resolveWeekPlan(thrice, [session('push', LAST_SUNDAY), session('pull', MONDAY)], MONDAY))
      .toEqual(plan)
  })

  it('rotationStart ignores sessions at or after the cutoff', () => {
    const split = defaultSplit(3)
    const history = [session('push', LAST_SUNDAY), session('pull', MONDAY)]
    expect(rotationStart(history, split)).toBe(2) // no cutoff: resumes after pull
    expect(rotationStart(history, split, startOfWeek(MONDAY))).toBe(1) // after push
    expect(rotationStart(history, split, startOfWeek(LAST_SUNDAY))).toBe(0)
  })

  it('a hand-built plan is fixed, so logging never touches it', () => {
    const custom: Settings = {
      ...DEFAULT_SETTINGS,
      weekPlan: ['legs', null, 'push', null, 'pull', null, null],
    }
    expect(resolveWeekPlan(custom, [session('legs', MONDAY)], MONDAY))
      .toEqual(['legs', null, 'push', null, 'pull', null, null])
  })

  it('does not offer today’s plan back once it has been trained', () => {
    const plan = resolveWeekPlan(thrice, [], MONDAY)
    const before = recommendDay([], MONDAY, { plan, weekday: mondayIndex(MONDAY) })
    expect(before.fromPlan).toBe(true)
    expect(before.dayType).toBe('push')

    const after = recommendDay([session('push', MONDAY)], MONDAY, {
      plan,
      weekday: mondayIndex(MONDAY),
    })
    expect(after.fromPlan).toBe(false)
    expect(after.dayType).not.toBe('push')
    expect(after.headline).toContain('Push done')

    // Yesterday's push is not today's: the plan still stands.
    const yesterday = recommendDay([session('push', LAST_SUNDAY)], MONDAY, {
      plan,
      weekday: mondayIndex(MONDAY),
    })
    expect(yesterday.fromPlan).toBe(true)
    expect(yesterday.dayType).toBe('push')
  })
})

describe('supersets', () => {
  it('groups consecutive joined ids into supersets of 2+', () => {
    const ids = ['a', 'b', 'c', 'd']
    // b joined to a, c joined to b => [a,b,c]; d alone.
    expect(buildSupersets(ids, new Set(['b', 'c']))).toEqual([['a', 'b', 'c']])
    // nothing joined => no supersets.
    expect(buildSupersets(ids, new Set())).toEqual([])
    // a join without a predecessor doesn't start a group on its own.
    expect(buildSupersets(ids, new Set(['a']))).toEqual([])
  })

  it('picks the partner with the fewest logged sets', () => {
    const group = ['a', 'b', 'c']
    const counts = { a: { length: 2 }, b: { length: 0 }, c: { length: 1 } }
    expect(nextPartner(group, 'a', counts)).toBe('b')
    expect(nextPartner(group, 'b', counts)).toBe('c') // a has 2, c has 1
    expect(nextPartner(null, 'a', counts)).toBeNull()
    expect(nextPartner(['a'], 'a', counts)).toBeNull()
  })
})
