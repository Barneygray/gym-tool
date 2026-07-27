import { describe, it, expect } from 'vitest'
import type { Session } from '../types'
import { MOBILITY } from '../types'
import { DESK_RESCUE, STRETCH_GROUPS, groupIdOfStretch } from '../data/stretches'
import { CONDITIONING } from '../data/conditioning'
import {
  COOLDOWN_MINUTES, COOLDOWN_TRACKS, buildCooldown, cooldownEntries, cooldownPhases,
  cooldownSessionKind, formatDuration, schemeCost, type CooldownMinutes, type CooldownTrack,
} from './cooldown'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 22)

const mobility = (stretchIds: string[], at: number): Session => ({
  uuid: crypto.randomUUID(),
  dayType: MOBILITY,
  startedAt: at,
  finishedAt: at,
  entries: stretchIds.map((id) => ({ exerciseId: id, sets: [{ weight: 0, reps: 1 }] })),
})

const conditioning = (moveIds: string[], at: number): Session => ({
  uuid: crypto.randomUUID(),
  dayType: 'conditioning',
  startedAt: at,
  finishedAt: at,
  entries: moveIds.map((id) => ({ exerciseId: id, sets: [{ weight: 0, reps: 1 }] })),
})

const TRACKS = COOLDOWN_TRACKS.map((t) => t.id)
const CORE_IDS = new Set(
  CONDITIONING
    .filter((m) => !m.purpose.includes('power') && (m.purpose.includes('core') || m.purpose.includes('spine')))
    .map((m) => m.id),
)

describe('cool-down blocks fit the time on offer', () => {
  for (const track of TRACKS) {
    for (const minutes of COOLDOWN_MINUTES) {
      it(`${track} / ${minutes} min fills the budget without overrunning it`, () => {
        const plan = buildCooldown(track, minutes, { muscles: ['chest', 'quads'], history: [], now: NOW })
        expect(plan.items.length).toBeGreaterThan(0)
        expect(plan.totalSec).toBeLessThanOrEqual(minutes * 60)
        // Not a token thirty seconds either: a block should use most of what
        // it asked for, or the choice of length meant nothing.
        expect(plan.totalSec).toBeGreaterThan(minutes * 60 * 0.85)
        // Each item's stated cost is the sum of its parts.
        for (const item of plan.items) {
          expect(item.seconds).toBe(10 + item.sets * item.workSec + (item.sets - 1) * item.restSec)
        }
        expect(plan.items.reduce((t, i) => t + i.seconds, 0)).toBe(plan.totalSec)
      })

      it(`${track} / ${minutes} min runs for exactly as long as it promises`, () => {
        const plan = buildCooldown(track, minutes, { muscles: ['back'], history: [], now: NOW })
        const phases = cooldownPhases(plan.items)
        expect(phases.reduce((t, p) => t + p.sec, 0)).toBe(plan.totalSec)
        // Every phase belongs to a real item, in order.
        expect(phases.map((p) => p.itemIndex)).toEqual([...phases.map((p) => p.itemIndex)].sort((a, b) => a - b))
        expect(new Set(phases.map((p) => p.itemIndex)).size).toBe(plan.items.length)
      })
    }
  }

  it('gives a ten-minute block more work than a five-minute one', () => {
    const ctx = { muscles: ['quads' as const], history: [], now: NOW }
    const short = buildCooldown('warm-down', 5, ctx)
    const long = buildCooldown('warm-down', 10, ctx)
    expect(long.items.length).toBeGreaterThan(short.items.length)
    expect(long.totalSec).toBeGreaterThan(short.totalSec)
  })
})

describe('warm down follows the session', () => {
  it('picks holds for the muscles just trained', () => {
    const plan = buildCooldown('warm-down', 5, { muscles: ['quads', 'glutes'], history: [], now: NOW })
    const groups = plan.items.map((i) => groupIdOfStretch.get(i.id))
    expect(groups.every((g) => g === 'legs-glutes')).toBe(true)
  })

  it('spans the groups a mixed session touched rather than emptying one', () => {
    const plan = buildCooldown('warm-down', 5, { muscles: ['chest', 'triceps'], history: [], now: NOW })
    const groups = new Set(plan.items.map((i) => groupIdOfStretch.get(i.id)))
    expect(groups).toEqual(new Set(['chest-shoulders', 'arms']))
  })

  it('falls back to the whole training catalog when no muscles are known', () => {
    const plan = buildCooldown('warm-down', 5, { history: [], now: NOW })
    expect(plan.items.length).toBeGreaterThan(0)
    const trainingIds = new Set(STRETCH_GROUPS.flatMap((g) => g.stretches.map((s) => s.id)))
    expect(plan.items.every((i) => trainingIds.has(i.id))).toBe(true)
  })

  it('backs a narrow session with the rest of the catalog rather than running short', () => {
    // Biceps alone matches one group of three holds — nowhere near ten minutes.
    const plan = buildCooldown('warm-down', 10, { muscles: ['biceps'], history: [], now: NOW })
    expect(plan.totalSec).toBeGreaterThan(0.85 * 600)
    // Everything relevant still comes first.
    const arms = plan.items.findIndex((i) => groupIdOfStretch.get(i.id) !== 'arms')
    expect(arms).toBe(STRETCH_GROUPS.find((g) => g.id === 'arms')!.stretches.length)
  })

  it('leads with the group left longest, among the ones just trained', () => {
    // Legs stretched today, chest not for a month: chest leads.
    const history = [mobility(['couch-quad'], NOW - 2 * 3600_000)]
    const plan = buildCooldown('warm-down', 5, {
      muscles: ['chest', 'quads'], history, now: NOW,
    })
    expect(groupIdOfStretch.get(plan.items[0].id)).toBe('chest-shoulders')
  })

  it('never trims a per-side hold to one side', () => {
    for (const minutes of COOLDOWN_MINUTES) {
      const plan = buildCooldown('warm-down', minutes, { muscles: ['quads'], history: [], now: NOW })
      expect(plan.items.every((i) => !i.trimmed)).toBe(true)
    }
  })
})

describe('posture correction', () => {
  it('draws only on the desk-rescue sequences', () => {
    const deskIds = new Set(DESK_RESCUE.flatMap((g) => g.stretches.map((s) => s.id)))
    const plan = buildCooldown('posture', 10, { muscles: ['chest'], history: [], now: NOW })
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.items.every((i) => deskIds.has(i.id))).toBe(true)
  })

  it('ignores the muscles trained — sitting all day is reason enough', () => {
    const a = buildCooldown('posture', 5, { muscles: ['calves'], history: [], now: NOW })
    const b = buildCooldown('posture', 5, { muscles: ['chest'], history: [], now: NOW })
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id))
  })

  it('leaves alone what was stretched today and reaches for what wasn’t', () => {
    const fresh = DESK_RESCUE[0].stretches.map((s) => s.id)
    const plan = buildCooldown('posture', 5, {
      history: [mobility(fresh, NOW - 3600_000)], now: NOW,
    })
    expect(groupIdOfStretch.get(plan.items[0].id)).not.toBe(DESK_RESCUE[0].id)
  })
})

describe('core work', () => {
  it('draws only on core and spinal-health conditioning', () => {
    const plan = buildCooldown('core', 10, { history: [], now: NOW })
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.items.every((i) => CORE_IDS.has(i.id))).toBe(true)
    expect(plan.items.every((i) => i.kind === 'conditioning')).toBe(true)
  })

  it('leaves power work out of it — a cool-down is not another session', () => {
    const power = new Set(CONDITIONING.filter((m) => m.purpose.includes('power')).map((m) => m.id))
    for (const minutes of COOLDOWN_MINUTES) {
      const plan = buildCooldown('core', minutes, { history: [], now: NOW })
      expect(plan.items.some((i) => power.has(i.id))).toBe(false)
    }
  })

  it('trims sets so more than one movement fits a five-minute block', () => {
    const plan = buildCooldown('core', 5, { history: [], now: NOW })
    expect(plan.items.length).toBeGreaterThanOrEqual(2)
    expect(plan.items.some((i) => i.trimmed)).toBe(true)
    expect(plan.items.every((i) => i.sets >= 2)).toBe(true)
    expect(plan.totalSec).toBeLessThanOrEqual(300)
  })

  it('states the sets it will actually run, not the catalog scheme', () => {
    const plan = buildCooldown('core', 5, { history: [], now: NOW })
    for (const item of plan.items) {
      expect(Number(/^\s*(\d+)/.exec(item.prescription)?.[1])).toBe(item.sets)
    }
  })

  it('needs no equipment on a first run, when nothing has been done before', () => {
    const bodyweight = new Set(CONDITIONING.filter((m) => m.equipment === 'bodyweight').map((m) => m.id))
    const plan = buildCooldown('core', 5, { history: [], now: NOW })
    expect(plan.items.every((i) => bodyweight.has(i.id))).toBe(true)
  })

  it('reaches for movements gone longest undone', () => {
    const stale = buildCooldown('core', 5, { history: [], now: NOW }).items.map((i) => i.id)
    // Do exactly those today; the next block should pick different ones.
    const plan = buildCooldown('core', 5, {
      history: [conditioning(stale, NOW - 3600_000)], now: NOW,
    })
    expect(plan.items.every((i) => !stale.includes(i.id))).toBe(true)
  })
})

describe('logging a cool-down', () => {
  it('files stretching as mobility and core work as conditioning', () => {
    expect(cooldownSessionKind('warm-down')).toBe(MOBILITY)
    expect(cooldownSessionKind('posture')).toBe(MOBILITY)
    expect(cooldownSessionKind('core')).toBe('conditioning')
  })

  it('logs a stretch as a single marker, never as volume', () => {
    const plan = buildCooldown('warm-down', 5, { muscles: ['quads'], history: [], now: NOW })
    const entries = cooldownEntries(plan.items)
    expect(entries).toHaveLength(plan.items.length)
    expect(entries.every((e) => e.sets.length === 1)).toBe(true)
  })

  it('logs the conditioning sets actually run, not the full scheme', () => {
    const plan = buildCooldown('core', 5, { history: [], now: NOW })
    const entries = cooldownEntries(plan.items)
    entries.forEach((e, i) => expect(e.sets).toHaveLength(plan.items[i].sets))
  })

  it('logs only what was completed', () => {
    const plan = buildCooldown('core', 10, { history: [], now: NOW })
    const entries = cooldownEntries(plan.items.slice(0, 1))
    expect(entries).toHaveLength(1)
    expect(entries[0].exerciseId).toBe(plan.items[0].id)
  })
})

describe('scheme costing', () => {
  it('reads seconds, metres and reps, doubling per-side work', () => {
    expect(schemeCost('3 × 30 s')).toEqual({ sets: 3, workSec: 30 })
    expect(schemeCost('3 × 30 s / side')).toEqual({ sets: 3, workSec: 60 })
    expect(schemeCost('4 × 40 m')).toEqual({ sets: 4, workSec: 40 })
    expect(schemeCost('5 × 15')).toEqual({ sets: 5, workSec: 38 }) // 15 reps × 2.5s
    expect(schemeCost('3 × 8 / side')).toEqual({ sets: 3, workSec: 40 })
  })

  it('floors a set at twenty seconds, so slow movements aren’t under-read', () => {
    expect(schemeCost('3 × 3 / side').workSec).toBe(20)
  })

  it('every catalog scheme costs a positive, finite set', () => {
    for (const move of CONDITIONING) {
      const { sets, workSec } = schemeCost(move.scheme)
      expect(sets).toBeGreaterThan(0)
      expect(workSec).toBeGreaterThan(0)
      expect(Number.isFinite(workSec)).toBe(true)
    }
  })
})

describe('phases drive the guided run', () => {
  it('gives every movement a set-up phase and one phase per hold or set', () => {
    const plan = buildCooldown('warm-down', 5, { muscles: ['quads'], history: [], now: NOW })
    const phases = cooldownPhases(plan.items)
    const first = plan.items[0]
    expect(phases[0]).toEqual({ itemIndex: 0, kind: 'prep', sec: 10, label: 'Get set' })
    const work = phases.filter((p) => p.itemIndex === 0 && p.kind === 'work')
    expect(work).toHaveLength(first.sets)
    if (first.sets === 2) expect(work.map((p) => p.label)).toEqual(['Hold — side 1', 'Hold — side 2'])
  })

  it('rests between conditioning sets but not between sides of a hold', () => {
    const core = cooldownPhases(buildCooldown('core', 10, { history: [], now: NOW }).items)
    expect(core.some((p) => p.kind === 'rest')).toBe(true)
    const holds = cooldownPhases(
      buildCooldown('warm-down', 10, { muscles: ['quads'], history: [], now: NOW }).items,
    )
    expect(holds.some((p) => p.kind === 'rest')).toBe(false)
  })

  it('formats a block length as minutes and seconds', () => {
    expect(formatDuration(295)).toBe('4:55')
    expect(formatDuration(600)).toBe('10:00')
    expect(formatDuration(65)).toBe('1:05')
  })
})

describe('a stale history doesn’t break the builder', () => {
  it('handles a year of logs and unknown ids without throwing', () => {
    const history: Session[] = [
      mobility(['couch-quad', 'not-a-stretch'], NOW - 400 * DAY),
      conditioning(['plank', 'not-a-move'], NOW - 400 * DAY),
    ]
    for (const track of TRACKS as CooldownTrack[]) {
      for (const minutes of COOLDOWN_MINUTES as readonly CooldownMinutes[]) {
        const plan = buildCooldown(track, minutes, { muscles: ['core'], history, now: NOW })
        expect(plan.items.length).toBeGreaterThan(0)
      }
    }
  })
})
