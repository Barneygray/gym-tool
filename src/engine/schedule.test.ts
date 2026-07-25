import { describe, it, expect } from 'vitest'
import type { Session, SetLog } from '../types'
import {
  clampFrequency, defaultSplit, weeklyPlan, rotationStart, nextTrainingDay, mondayIndex,
} from './schedule'
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
