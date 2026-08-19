import { describe, it, expect } from 'vitest'
import type { Session, SetLog } from '../types'
import { EXERCISES, getExercise } from '../data/exercises'
import { DEFAULT_SETTINGS } from '../db/db'
import { loadableRound, suggestFor } from './progression'
import { nextSetTarget } from './liveSets'
import { roundToStep } from './plates'
import { warmupRamp } from './warmup'

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

const settings = DEFAULT_SETTINGS
const raise = getExercise('lateral-raise') // 10–15 reps, +1 kg, dumbbell
const curl = getExercise('cable-curl') // 10–15 reps, +1.25 kg, stack

/** Is `kg` a weight you could actually set on equipment moving in `step` kg? */
const settable = (kg: number, step: number) => Math.abs(kg / step - Math.round(kg / step)) < 1e-6

// ── The grid off the bar ────────────────────────────────
describe('non-barbell rounding follows the equipment, not a half-kilo', () => {
  it('never prescribes a half-kilo on a rack that moves in whole ones', () => {
    // The reported bug. Six consistent RPE 10 tags is a full-confidence grind
    // read, which halves the jump: 18 + 1 × 0.5. That used to round to 18.5 kg —
    // a dumbbell that doesn't exist, and one that put every later suggestion
    // half a kilo off every bell in the rack.
    const ground = [{ weight: 18, reps: 15, rpe: 10 }, { weight: 18, reps: 15, rpe: 10 }, { weight: 18, reps: 15, rpe: 10 }]
    const s = suggestFor(raise, [
      session('lateral-raise', ground, NOW - DAY),
      session('lateral-raise', ground, NOW - 4 * DAY),
    ], settings)

    expect(settable(s.weight, raise.increment)).toBe(true)
    // Half an increment is no increment at all, so the honest answer is to own
    // the weight again rather than invent a bell between the two on the rack.
    expect(s.weight).toBe(18)
    expect(s.kind).toBe('build')
    expect(s.reason).toContain('1 kg step')
  })

  it('rounds a part-earned jump down to the last real dumbbell', () => {
    // RPE 8 on three tagged sets: a 1.25 × increment jump, landing at 19.25 kg.
    // Rounded onto the half-kilo that was 19.5 — above what the read earned and
    // still not a dumbbell. The rack's answer is 19.
    const s = suggestFor(raise, [session('lateral-raise', [
      { weight: 18, reps: 15, rpe: 8 }, { weight: 18, reps: 15, rpe: 8 }, { weight: 18, reps: 15, rpe: 8 },
    ], NOW - DAY)], settings)

    expect(s.kind).toBe('increase')
    expect(s.weight).toBe(19)
  })

  it('still pays out the jumps the rack can make', () => {
    const easy = [{ weight: 18, reps: 15, rpe: 6 }, { weight: 18, reps: 15, rpe: 6 }, { weight: 18, reps: 15, rpe: 6 }]
    const s = suggestFor(raise, [
      session('lateral-raise', easy, NOW - DAY),
      session('lateral-raise', easy, NOW - 4 * DAY),
    ], settings)

    expect(s.kind).toBe('increase')
    expect(s.weight).toBe(20) // 18 + 2 × 1
  })

  it('keeps a stack on its own pin spacing', () => {
    // A 1.25 kg stack has no 21.5 on it, which is where the half-kilo grid put
    // a plain single increment off 20 kg.
    const s = suggestFor(curl, [session('cable-curl', [
      { weight: 20, reps: 15 }, { weight: 20, reps: 15 }, { weight: 20, reps: 15 },
    ], NOW - DAY)], settings)

    expect(s.kind).toBe('increase')
    expect(s.weight).toBe(21.25)
  })

  it('backs a stalled lift off onto a real weight too', () => {
    // Three sessions going nowhere: 90% of 18 is 16.2, and 16.2 kg of dumbbell
    // is not a thing you can pick up.
    const flat = [{ weight: 18, reps: 12 }, { weight: 18, reps: 12 }, { weight: 18, reps: 12 }]
    const s = suggestFor(raise, [
      session('lateral-raise', flat, NOW - DAY),
      session('lateral-raise', flat, NOW - 4 * DAY),
      session('lateral-raise', flat, NOW - 7 * DAY),
    ], settings)

    expect(s.kind).toBe('deload')
    expect(s.weight).toBe(16)
  })

  it('lands every catalog lift on a weight its equipment can be set to', () => {
    for (const e of EXERCISES) {
      if (e.barLoaded) continue
      const [, hi] = e.repRange
      for (const weight of [8, 18, 20, 45, 67.5]) {
        const history = [session(e.id, [
          { weight, reps: hi, rpe: 7 }, { weight, reps: hi, rpe: 9 }, { weight, reps: hi, rpe: 8 },
        ], NOW - DAY)]
        const s = suggestFor(e, history, settings)
        expect(
          settable(s.weight, e.increment),
          `${e.name} suggested ${s.weight} kg on a ${e.increment} kg grid`,
        ).toBe(true)
      }
    }
  })
})

// ── Mid-session steering stays on the same grid ─────────
describe('live set targets', () => {
  const plan = { weight: 18, targetReps: 12, sets: 3, reason: '', kind: 'build' as const }

  it('takes the jump to the next real bell, not half of one', () => {
    const t = nextSetTarget(raise, plan, [{ weight: 18, reps: 15, rpe: 6 }], settings)
    expect(t.kind).toBe('up')
    expect(t.weight).toBe(19)
  })

  it('drops to the next real bell down', () => {
    const t = nextSetTarget(raise, plan, [{ weight: 18, reps: 6 }], settings)
    expect(t.kind).toBe('down')
    expect(t.weight).toBe(17)
  })
})

// ── Warm-ups are weights too ────────────────────────────
describe('warm-up ramps', () => {
  it('ramps a machine on the machine\'s own steps', () => {
    // 75% of 50 kg is 37.5 — settable on a 2.5 kg stack, and rounded off it by
    // the flat 2 kg grid the ramp used to assume.
    const press = getExercise('machine-chest-press') // compound, +2.5 kg
    for (const set of warmupRamp(press, 50, settings)) {
      expect(settable(set.weight, press.increment)).toBe(true)
    }
    expect(warmupRamp(press, 50, settings).map((s) => s.weight)).toEqual([25, 37.5])
  })
})

// ── The rounding primitive ──────────────────────────────
describe('roundToStep', () => {
  it('rounds down onto the grid, never onto a rung between two', () => {
    expect(roundToStep(18.5, 1)).toBe(18)
    expect(roundToStep(19.99, 1)).toBe(19)
    expect(roundToStep(21.5, 1.25)).toBe(21.25)
    expect(roundToStep(37.5, 2.5)).toBe(37.5)
  })

  it('leaves an exact multiple alone, without floating-point dust', () => {
    for (const step of [1, 1.25, 2, 2.5, 5]) {
      for (let n = 1; n <= 40; n++) {
        expect(roundToStep(n * step, step)).toBe(n * step)
      }
    }
  })

  it('never goes below an empty implement', () => {
    expect(roundToStep(0.4, 1)).toBe(0)
    expect(roundToStep(-3, 1)).toBe(0)
  })

  it('passes a nonsense step through rather than dividing by it', () => {
    expect(roundToStep(20, 0)).toBe(20)
  })
})

// ── The bar is unchanged ────────────────────────────────
describe('bar-loaded lifts still round to loadable plates', () => {
  it('rounds to what the plates in the room can make', () => {
    const bench = getExercise('bench-press')
    expect(loadableRound(bench, 81, settings)).toBe(80)
    expect(loadableRound(bench, 82.5, settings)).toBe(82.5)
  })
})
