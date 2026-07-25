import { describe, it, expect, afterEach } from 'vitest'
import type { Session, SetLog } from '../types'
import { CONDITIONING, CONDITIONING_EXERCISES, setsInScheme } from '../data/conditioning'
import { EXERCISES, exerciseById, getExercise, isBodyweightLoaded, registerCustomExercises } from '../data/exercises'
import { makeCustomDay, registerCustomDays } from '../data/days'
import { recoveryByMuscle, prsFor, newPRsInSession, volumeByMuscle, isReliableE1rm, repBucket, bestReliableE1rm, E1RM_MAX_REPS } from './stats'
import { weeklySetsByMuscle } from './volume'
import { isStalled, madeProgress } from './stall'
import { performancesOf } from './history'
import { bodyweightAt } from './bodyweight'
import { recommendDay } from './coach'
import { autoWeekPlan } from './schedule'

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

/** A conditioning session as the Condition tab writes it: one marker per set. */
function conditioningSession(moveId: string, startedAt: number): Session {
  const scheme = CONDITIONING.find((m) => m.id === moveId)!.scheme
  return session('conditioning', moveId, Array.from({ length: setsInScheme(scheme) }, () => ({ weight: 0, reps: 1 })), startedAt)
}

afterEach(() => {
  registerCustomExercises([])
  registerCustomDays([])
})

// ── Conditioning counts ─────────────────────────────────
describe('conditioning in the stats', () => {
  it('resolves through the lookup catalog but is never prescribable', () => {
    // In `exerciseById`, so logged sessions resolve to a real name…
    expect(exerciseById.get('kb-swing')?.name).toBe('Kettlebell Swing')
    expect(getExercise('turkish-getup').conditioning).toBe(true)
    // …but out of `EXERCISES`, so no picker, program builder, or progression
    // engine ever offers a Turkish get-up a target weight.
    expect(EXERCISES.some((e) => e.id === 'kb-swing')).toBe(false)
  })

  it('survives a custom-exercise registration', () => {
    registerCustomExercises([])
    expect(exerciseById.get('plank')?.name).toBe('RKC Plank')
  })

  it('reads the set count out of the scheme', () => {
    expect(setsInScheme('5 × 15')).toBe(5)
    expect(setsInScheme('3 × 30 s / side')).toBe(3)
    expect(setsInScheme('4 × 40 m')).toBe(4)
    expect(setsInScheme('nonsense')).toBe(1)
  })

  it('counts toward muscle freshness — the whole point of the Condition tab', () => {
    const h = [conditioningSession('kb-swing', NOW - DAY)]
    const recovery = recoveryByMuscle(h, NOW)
    // kb-swing: primary glutes, secondary hamstrings/back/core.
    expect(recovery.get('glutes')).toBeLessThan(2)
    expect(recovery.get('hamstrings')).toBeLessThan(2)
    // Untouched muscles are still untouched.
    expect(recovery.get('chest')).toBe(Infinity)
  })

  it('counts toward weekly hard sets, with the usual half credit for secondaries', () => {
    const h = [conditioningSession('kb-swing', NOW - DAY)] // 5 × 15
    const sets = weeklySetsByMuscle(h, NOW - 7 * DAY, NOW + 1)
    expect(sets.get('glutes')).toBe(5)
    expect(sets.get('hamstrings')).toBe(2.5)
  })

  it('adds no phantom tonnage — a plank is a marker, not a rep at bodyweight', () => {
    const bw = bodyweightAt([{ at: NOW - 30 * DAY, kg: 80 }])
    expect(isBodyweightLoaded(getExercise('plank'))).toBe(false)
    const h = [conditioningSession('plank', NOW - DAY)]
    expect(volumeByMuscle(h, NOW - 7 * DAY, NOW + 1, bw).get('core') ?? 0).toBe(0)
  })

  it('every move maps to a muscle', () => {
    expect(CONDITIONING_EXERCISES).toHaveLength(CONDITIONING.length)
    for (const m of CONDITIONING) expect(typeof m.primary).toBe('string')
  })
})

// ── Plan-aware coach ────────────────────────────────────
describe('plan-aware coach', () => {
  const monday = 0
  const plan = autoWeekPlan(4, 0) // push, pull, rest, legs, rest, arms, rest

  it('leads with the planned day instead of second-guessing it', () => {
    const h = [session('legs', 'back-squat', [{ weight: 100, reps: 5 }], NOW - 6 * DAY)]
    const rec = recommendDay(h, NOW, { plan, weekday: monday })
    expect(rec.fromPlan).toBe(true)
    expect(rec.dayType).toBe(plan[monday])
  })

  it('falls back to freshness when nothing is planned for today', () => {
    const h = [session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 3 * DAY)]
    const rec = recommendDay(h, NOW, { plan, weekday: 2 }) // Wednesday = rest
    expect(rec.fromPlan).toBe(false)
    expect(rec.headline).toContain('Rest day')
  })

  it('keeps the old freshness behaviour when there is no plan at all', () => {
    const rec = recommendDay([], NOW)
    expect(rec.fromPlan).toBe(false)
    expect(rec.conflict).toBeNull()
    expect(rec.headline).toBe('Start here')
  })

  it('flags a genuine disagreement rather than silently going along with it', () => {
    // Push was hammered yesterday, but Monday's plan says Push.
    const h = [
      session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 0.5 * DAY),
      session('legs', 'back-squat', [{ weight: 100, reps: 5 }], NOW - 9 * DAY),
    ]
    const rec = recommendDay(h, NOW, { plan, weekday: monday })
    expect(rec.fromPlan).toBe(true)
    expect(rec.conflict).not.toBeNull()
    expect(rec.conflict!.withDay).not.toBe(rec.dayType)
    expect(rec.conflict!.note).toContain('fresher')
  })

  it('stays quiet when the plan and recovery agree', () => {
    const h = [session('legs', 'back-squat', [{ weight: 100, reps: 5 }], NOW - 6 * DAY)]
    expect(recommendDay(h, NOW, { plan, weekday: monday }).conflict).toBeNull()
  })

  it('still reports overdue and under-volume muscles', () => {
    const h = [session('push', 'bench-press', [{ weight: 80, reps: 6 }], NOW - DAY)]
    const rec = recommendDay(h, NOW, { plan, weekday: monday })
    expect(rec.underVolume).toContain('chest')
  })

  it('recommends a custom day when the plan schedules one', () => {
    registerCustomDays([makeCustomDay({
      id: 'day-upper', name: 'Upper Body A', slots: [{ muscle: 'chest', pool: ['bench-press'] }],
    })])
    const custom = ['day-upper', null, null, null, null, null, null]
    const rec = recommendDay([], NOW, { plan: custom, weekday: monday })
    expect(rec.dayType).toBe('day-upper')
    expect(rec.dayName).toBe('Upper Body A')
  })
})

// ── Rep-range-aware e1RM ────────────────────────────────
describe('rep-range-aware e1RM', () => {
  it('marks where the estimate stops holding up', () => {
    expect(isReliableE1rm(5)).toBe(true)
    expect(isReliableE1rm(E1RM_MAX_REPS)).toBe(true)
    expect(isReliableE1rm(E1RM_MAX_REPS + 1)).toBe(false)
    expect(isReliableE1rm(0)).toBe(false)
  })

  it('sorts sets into rep bands', () => {
    expect(repBucket(3)).toBe('strength')
    expect(repBucket(8)).toBe('hypertrophy')
    expect(repBucket(15)).toBe('endurance')
  })

  it('bestReliableE1rm ignores sets past the window, and reports 0 with none', () => {
    expect(bestReliableE1rm([{ weight: 100, reps: 5 }, { weight: 40, reps: 20 }])).toBeCloseTo(100 * (1 + 5 / 30))
    expect(bestReliableE1rm([{ weight: 40, reps: 20 }])).toBe(0)
  })

  it('a high-rep back-off set can no longer out-rank a heavy triple', () => {
    const h = [session('push', 'lateral-raise', [
      { weight: 28, reps: 3 },  // Epley: 30.8 — the genuinely heavy set
      { weight: 20, reps: 15 }, // Epley: 30
      { weight: 22, reps: 15 }, // Epley: 33 — would have stolen the e1RM PR
    ], NOW - DAY)]
    const pr = prsFor('lateral-raise', h)
    // The e1RM record comes from the reliable set only.
    expect(pr.bestE1rm?.reps).toBe(3)
    expect(pr.bestE1rm?.weight).toBe(28)
    // The raw heaviest-load record is unaffected.
    expect(pr.maxWeight?.weight).toBe(28)
  })

  it('tracks a best per rep band, so like competes with like', () => {
    const h = [session('push', 'bench-press', [
      { weight: 100, reps: 3 }, { weight: 80, reps: 8 }, { weight: 60, reps: 15 },
    ], NOW - DAY)]
    const { byBucket } = prsFor('bench-press', h)
    expect(byBucket.strength).toMatchObject({ weight: 100, reps: 3 })
    expect(byBucket.hypertrophy).toMatchObject({ weight: 80, reps: 8 })
    expect(byBucket.endurance).toMatchObject({ weight: 60, reps: 15 })
  })

  it('no longer celebrates a PR for a set that is only a rep-scheme change', () => {
    const prior = [session('push', 'lateral-raise', [{ weight: 20, reps: 8 }], NOW - 7 * DAY)]
    // A lighter, much higher-rep set: Epley would score it 24 vs the prior 25.3
    // — but push it to 18 × 20 and the old rule scored it 30 and called it a PR.
    const today = session('push', 'lateral-raise', [{ weight: 18, reps: 20 }], NOW - DAY)
    const prs = newPRsInSession(today, [today, ...prior])
    expect(prs).toHaveLength(0)
  })

  it('still records real PRs inside the reliable window', () => {
    const prior = [session('push', 'bench-press', [{ weight: 80, reps: 5 }], NOW - 7 * DAY)]
    const today = session('push', 'bench-press', [{ weight: 85, reps: 5 }], NOW - DAY)
    expect(newPRsInSession(today, [today, ...prior])).toHaveLength(1)
  })

  it('does not read a rep-scheme change as progress in stall detection', () => {
    // Twenty reps at 12 kg either way — one long set this time, two shorter
    // ones last time. Same load, same total reps: nothing was gained. Epley
    // scored the single 20-rep set 20 against the pair's 16 and called that
    // progress, which is enough to keep a genuinely stalled lift off a deload.
    const perfs = performancesOf('lateral-raise', [
      session('push', 'lateral-raise', [{ weight: 12, reps: 20 }], NOW - DAY),
      session('push', 'lateral-raise', [{ weight: 12, reps: 10 }, { weight: 12, reps: 10 }], NOW - 7 * DAY),
    ])
    expect(madeProgress(perfs[0], perfs[1], 'lateral-raise')).toBe(false)
  })

  it('still flags a real stall and still spares a real gain', () => {
    const flat = [{ weight: 80, reps: 6 }, { weight: 80, reps: 6 }, { weight: 80, reps: 6 }]
    const stalled = [
      session('push', 'bench-press', flat, NOW - DAY),
      session('push', 'bench-press', flat, NOW - 4 * DAY),
      session('push', 'bench-press', flat, NOW - 8 * DAY),
    ]
    expect(isStalled('bench-press', stalled)).toBe(true)

    const improving = [
      session('push', 'bench-press', [{ weight: 82.5, reps: 6 }], NOW - DAY),
      session('push', 'bench-press', flat, NOW - 4 * DAY),
      session('push', 'bench-press', flat, NOW - 8 * DAY),
    ]
    expect(isStalled('bench-press', improving)).toBe(false)
  })
})
