import { describe, it, expect, afterEach } from 'vitest'
import type { Goal, Session, SetLog } from '../types'
import { currentPhase, phaseFor } from './mesocycle'
import { suggestFor } from './progression'
import { projectGoal, newlyAchieved } from './goals'
import { reminderNudge, trainedToday } from './reminder'
import { registerCustomDays, makeCustomDay, isCustomDay, dayById, BUILTIN_DAY_IDS } from '../data/days'
import { generateWorkout } from './rotation'
import { getExercise } from '../data/exercises'
import { DEFAULT_SETTINGS } from '../db/db'

const DAY = 86_400_000
const WEEK = 7 * DAY
const NOW = Date.UTC(2026, 6, 22)

function session(dayType: Session['dayType'], exerciseId: string, sets: SetLog[], startedAt: number): Session {
  return { uuid: crypto.randomUUID(), dayType, startedAt, finishedAt: startedAt + 3_600_000, entries: [{ exerciseId, sets }] }
}

describe('mesocycle phases', () => {
  const config = { startAt: NOW, weeks: 4 }

  it('ramps accumulation then lands on a deload in the final week', () => {
    expect(currentPhase(config, NOW).phase).toBe('accumulation')
    expect(currentPhase(config, NOW).setBias).toBe(0)
    expect(currentPhase(config, NOW + WEEK).setBias).toBe(1)
    expect(currentPhase(config, NOW + 2 * WEEK).setBias).toBe(2)
    const deload = currentPhase(config, NOW + 3 * WEEK)
    expect(deload.phase).toBe('deload')
    expect(deload.intensity).toBeLessThan(1)
    expect(deload.setBias).toBeLessThan(0)
  })

  it('wraps to a fresh block after the deload', () => {
    expect(currentPhase(config, NOW + 4 * WEEK).phase).toBe('accumulation')
    expect(currentPhase(config, NOW + 4 * WEEK).week).toBe(1)
  })

  it('clamps a block to at least 3 weeks', () => {
    expect(currentPhase({ startAt: NOW, weeks: 1 }, NOW).weeks).toBe(3)
  })

  it('phaseFor returns null when no block is set', () => {
    expect(phaseFor(null, NOW)).toBeNull()
  })
})

describe('periodized progression', () => {
  const ex = getExercise('bench-press')
  // A history where the last session topped the rep range → normally an increase.
  const topped = [
    session('push', 'bench-press', [
      { weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 },
    ], NOW - DAY),
  ]

  it('accumulation adds sets without changing the load logic', () => {
    const base = suggestFor(ex, topped, DEFAULT_SETTINGS)
    const acc = suggestFor(ex, topped, DEFAULT_SETTINGS, currentPhase({ startAt: NOW, weeks: 4 }, NOW + 2 * WEEK))
    expect(acc.kind).toBe('increase')
    expect(acc.weight).toBe(base.weight)
    expect(acc.sets).toBe(base.sets + 2)
  })

  it('deload backs the weight off and cuts a set', () => {
    const deload = suggestFor(ex, topped, DEFAULT_SETTINGS, currentPhase({ startAt: NOW, weeks: 4 }, NOW + 3 * WEEK))
    expect(deload.kind).toBe('deload')
    expect(deload.weight).toBeLessThan(80)
    expect(deload.sets).toBe(2)
  })

  it('no phase leaves behaviour unchanged', () => {
    expect(suggestFor(ex, topped, DEFAULT_SETTINGS).sets).toBe(3)
  })
})

describe('goal projection', () => {
  // Two sessions a week apart, e1RM rising ~ +5kg/week on bench.
  const rising = [
    session('push', 'bench-press', [{ weight: 100, reps: 1 }], NOW - 2 * WEEK),
    session('push', 'bench-press', [{ weight: 110, reps: 1 }], NOW - WEEK),
  ]

  it('projects a future date from a rising trend', () => {
    const goal: Goal = { id: 'g1', exerciseId: 'bench-press', targetE1rm: 130, createdAt: NOW }
    const p = projectGoal(goal, rising, undefined, NOW)
    expect(p.current).toBe(110)
    expect(p.perWeek).toBeCloseTo(10)
    expect(p.projectedAt).not.toBeNull()
    expect(p.projectedAt!).toBeGreaterThan(NOW)
    expect(p.achieved).toBe(false)
  })

  it('marks an already-hit goal achieved with full progress', () => {
    const goal: Goal = { id: 'g2', exerciseId: 'bench-press', targetE1rm: 105, createdAt: NOW }
    const p = projectGoal(goal, rising, undefined, NOW)
    expect(p.achieved).toBe(true)
    expect(p.pct).toBe(1)
  })

  it('will not project from a flat or falling trend', () => {
    const flat = [
      session('push', 'bench-press', [{ weight: 100, reps: 1 }], NOW - 2 * WEEK),
      session('push', 'bench-press', [{ weight: 100, reps: 1 }], NOW - WEEK),
    ]
    const goal: Goal = { id: 'g3', exerciseId: 'bench-press', targetE1rm: 130, createdAt: NOW }
    expect(projectGoal(goal, flat, undefined, NOW).projectedAt).toBeNull()
  })

  it('flags on-pace against a deadline', () => {
    const goal: Goal = { id: 'g4', exerciseId: 'bench-press', targetE1rm: 130, createdAt: NOW, targetDate: NOW + 10 * WEEK }
    expect(projectGoal(goal, rising, undefined, NOW).onPace).toBe(true)
    // Trend crosses 130 at ~NOW+1wk, so a 3-day deadline is behind pace.
    const tight: Goal = { ...goal, id: 'g5', targetDate: NOW + 3 * DAY }
    expect(projectGoal(tight, rising, undefined, NOW).onPace).toBe(false)
  })

  it('newlyAchieved surfaces unstamped hits only', () => {
    const goals: Goal[] = [
      { id: 'a', exerciseId: 'bench-press', targetE1rm: 105, createdAt: NOW },
      { id: 'b', exerciseId: 'bench-press', targetE1rm: 105, createdAt: NOW, achievedAt: NOW },
      { id: 'c', exerciseId: 'bench-press', targetE1rm: 999, createdAt: NOW },
    ]
    expect(newlyAchieved(goals, rising).map((g) => g.id)).toEqual(['a'])
  })
})

describe('training reminder', () => {
  const noon = Date.UTC(2026, 6, 22, 12)

  it('is due after the hour when nothing is logged today', () => {
    const n = reminderNudge({ hour: 9 }, [], noon)
    expect(n.due).toBe(true)
    expect(n.body.length).toBeGreaterThan(0)
  })

  it('is not due before the configured hour', () => {
    expect(reminderNudge({ hour: 20 }, [], noon).due).toBe(false)
  })

  it('is not due once a gym day is logged today', () => {
    const today = [session('push', 'bench-press', [{ weight: 80, reps: 5 }], noon - 3_600_000)]
    expect(trainedToday(today, noon)).toBe(true)
    expect(reminderNudge({ hour: 9 }, today, noon).due).toBe(false)
  })

  it('conditioning does not count as training today', () => {
    const cond = [session('conditioning', 'bench-press', [{ weight: 0, reps: 10 }], noon - 3_600_000)]
    expect(trainedToday(cond, noon)).toBe(false)
  })

  it('off when unconfigured', () => {
    expect(reminderNudge(null, [], noon).due).toBe(false)
  })
})

describe('custom days (program builder)', () => {
  afterEach(() => registerCustomDays([]))

  it('builds a day, derives its muscle list, and registers it live', () => {
    const day = makeCustomDay({
      name: 'Upper',
      slots: [
        { muscle: 'chest', pool: ['bench-press'] },
        { muscle: 'back', pool: ['barbell-row'] },
        { muscle: 'chest', pool: ['incline-db-press'] },
      ],
    })
    expect(day.muscles).toEqual(['chest', 'back'])
    expect(day.custom).toBe(true)
    registerCustomDays([day])
    expect(dayById.get(day.id)?.name).toBe('Upper')
    expect(isCustomDay(day.id)).toBe(true)
  })

  it('never overrides a built-in day id', () => {
    registerCustomDays([makeCustomDay({ id: 'push', name: 'Hijack', slots: [{ muscle: 'chest', pool: ['bench-press'] }] })])
    expect(dayById.get('push')?.name).toBe('Push')
    expect([...BUILTIN_DAY_IDS]).toContain('push')
  })

  it('generates a workout from a custom day like a built-in one', () => {
    const day = makeCustomDay({
      name: 'Full Body',
      slots: [
        { muscle: 'quads', pool: ['back-squat'] },
        { muscle: 'chest', pool: ['bench-press'] },
      ],
    })
    registerCustomDays([day])
    expect(generateWorkout(dayById.get(day.id)!, [])).toEqual(['back-squat', 'bench-press'])
  })
})
