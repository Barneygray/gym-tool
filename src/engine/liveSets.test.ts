import { describe, it, expect } from 'vitest'
import type { Session, SetLog } from '../types'
import { getExercise } from '../data/exercises'
import { DEFAULT_SETTINGS } from '../db/db'
import { suggestFor } from './progression'
import { nextSetTarget } from './liveSets'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

function session(exerciseId: string, sets: SetLog[], startedAt: number): Session {
  return {
    uuid: crypto.randomUUID(),
    dayType: 'push',
    startedAt,
    finishedAt: startedAt + 3_600_000,
    entries: [{ exerciseId, sets }],
  }
}

const bench = getExercise('bench-press') // 5–8 reps, +2.5 kg, bar-loaded
const settings = DEFAULT_SETTINGS

// ── One set at the top is the trigger ───────────────────
describe('topping the range once', () => {
  const build = (sets: SetLog[]) =>
    suggestFor(bench, [session('bench-press', sets, NOW - DAY)], settings)

  it('takes one top-of-range set, not all of them', () => {
    expect(build([{ weight: 80, reps: 8 }, { weight: 80, reps: 7 }, { weight: 80, reps: 6 }]).kind)
      .toBe('increase')
    // …and the one that got there can be any of them.
    expect(build([{ weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 8 }]).kind)
      .toBe('increase')
  })

  it('still holds the weight when nothing reached the top', () => {
    const s = build([{ weight: 80, reps: 7 }, { weight: 80, reps: 7 }, { weight: 80, reps: 7 }])
    expect(s.kind).toBe('build')
    expect(s.weight).toBe(80)
  })

  it('caps a partial top at a single increment however easy it felt', () => {
    // A settled RPE 6 read doubles the jump when every set topped the range.
    // With one set of three there, the double would prescribe a weight nothing
    // has been lifted for, so the cap holds it to one increment.
    const easy = (reps: number[]) => suggestFor(bench, [
      session('bench-press', reps.map((r) => ({ weight: 80, reps: r, rpe: 6 })), NOW - DAY),
      session('bench-press', reps.map((r) => ({ weight: 80, reps: r, rpe: 6 })), NOW - 4 * DAY),
    ], settings)

    expect(easy([8, 8, 8]).weight).toBe(85) // clean: 80 + 2 × 2.5
    expect(easy([8, 6, 6]).weight).toBe(82.5) // partial: capped at one increment
  })

  it('keeps the ramp downside on a partial top', () => {
    // The cap is one-sided: it holds an easy read back to a single increment,
    // but a grind still earns less than one.
    const grind = suggestFor(bench, [session('bench-press', [
      { weight: 100, reps: 8, rpe: 10 }, { weight: 100, reps: 5, rpe: 10 }, { weight: 100, reps: 5, rpe: 10 },
    ], NOW - DAY)], { ...settings, platesKg: [1.25, 2.5, 5, 10, 20] })
    // 100 + 0.75 × 2.5 = 101.875, floored to the loadable 2.5 kg step.
    expect(grind.weight).toBe(100)
  })

  it('does not call it a level-up when the jump rounds away to nothing', () => {
    // Same grind on a gym whose smallest plates can't express it: claiming an
    // increase while showing last week's weight would read as a bug.
    const s = suggestFor(bench, [session('bench-press', [
      { weight: 100, reps: 8, rpe: 10 }, { weight: 100, reps: 5, rpe: 10 }, { weight: 100, reps: 5, rpe: 10 },
    ], NOW - DAY)], settings)
    expect(s.kind).toBe('build')
    expect(s.weight).toBe(100)
    expect(s.reason).toMatch(/smaller than your smallest plates/)
  })

  it('names the shortcut while you are still building', () => {
    const s = build([{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }, { weight: 80, reps: 5 }])
    expect(s.reason).toMatch(/One set at 8 moves the weight up/)
  })
})

// ── Live, mid-session targets ───────────────────────────
describe('live next-set target', () => {
  const plan = suggestFor(bench, [session('bench-press', [
    { weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 6 },
  ], NOW - DAY)], settings)

  it('is the session prescription before the first set', () => {
    const t = nextSetTarget(bench, plan, [], settings)
    expect(t.kind).toBe('plan')
    expect(t.weight).toBe(plan.weight)
    expect(t.reps).toBe(plan.targetReps)
    expect(t.reason).toBe(plan.reason)
    expect(t.setNumber).toBe(1)
    expect(t.banked).toBe(false)
  })

  it('takes the jump mid-session when the range is topped with reps to spare', () => {
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 8, rpe: 7 }], settings)
    expect(t.kind).toBe('up')
    expect(t.weight).toBe(82.5)
    expect(t.reps).toBe(5) // rebuild from the bottom of the range at the new weight
    expect(t.setNumber).toBe(2)
  })

  it('holds the weight when the top of the range cost you', () => {
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 8, rpe: 9 }], settings)
    expect(t.kind).toBe('hold')
    expect(t.weight).toBe(80)
    expect(t.reps).toBe(8)
    expect(t.banked).toBe(true)
    expect(t.reason).toMatch(/next session moves up/)
  })

  it('reads a set logged unsure as neither easy nor hard', () => {
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 6 }], settings)
    expect(t.kind).toBe('hold')
    expect(t.weight).toBe(80)
    expect(t.reps).toBe(6) // match it — no RPE is not evidence of room
  })

  it('asks for one more rep when the tag says there was room', () => {
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 6, rpe: 7 }], settings)
    expect(t.reps).toBe(7)
    expect(t.weight).toBe(80)
  })

  it('gives a rep back when the last set was at the limit', () => {
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 6, rpe: 10 }], settings)
    expect(t.reps).toBe(5)
    expect(t.weight).toBe(80)
    expect(t.reason).toMatch(/drop-off across sets is normal/)
  })

  it('never targets below the bottom of the range', () => {
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 5, rpe: 10 }], settings)
    expect(t.reps).toBe(5)
  })

  it('drops the weight once reps fall out of the range', () => {
    const t = nextSetTarget(bench, plan, [
      { weight: 80, reps: 6, rpe: 9 }, { weight: 80, reps: 4, rpe: 10 },
    ], settings)
    expect(t.kind).toBe('down')
    expect(t.weight).toBe(77.5)
    expect(t.reps).toBe(5)
  })

  it('reads the set in front of it, not the one before', () => {
    const done: SetLog[] = [{ weight: 80, reps: 8, rpe: 7 }, { weight: 82.5, reps: 5, rpe: 9 }]
    const t = nextSetTarget(bench, plan, done, settings)
    expect(t.weight).toBe(82.5)
    expect(t.kind).toBe('hold')
    // The 8 was at 80, and 82.5 is the session's top weight now — so nothing at
    // the weight that counts has topped the range yet.
    expect(t.banked).toBe(false)
  })

  it('ignores a lighter set when deciding what is banked', () => {
    const t = nextSetTarget(bench, plan, [
      { weight: 60, reps: 8, rpe: 6 }, { weight: 80, reps: 6, rpe: 8 },
    ], settings)
    expect(t.banked).toBe(false)
    expect(t.weight).toBe(80)
  })

  it('flags the sets past the prescription as bonus work', () => {
    const done: SetLog[] = Array.from({ length: plan.sets }, () => ({ weight: 80, reps: 6, rpe: 8 }))
    expect(nextSetTarget(bench, plan, done.slice(0, plan.sets - 1), settings).beyondPlan).toBe(false)
    expect(nextSetTarget(bench, plan, done, settings).beyondPlan).toBe(true)
  })

  it('rounds a mid-session jump to what the gym can load', () => {
    // A rack with nothing smaller than 5s can't express 2.5 kg, so the jump has
    // to land on a weight that exists rather than one the maths liked.
    const coarse = { ...settings, platesKg: [5, 10, 20] }
    const t = nextSetTarget(bench, plan, [{ weight: 80, reps: 8, rpe: 6 }], coarse)
    expect(t.kind).toBe('hold') // 80 + 2.5 rounds back to 80, so nothing to take
    expect(t.weight).toBe(80)
    expect(t.reps).toBe(8)
  })
})
