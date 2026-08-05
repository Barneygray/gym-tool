import type { Exercise, ReadinessLevel, Session, Settings, Suggestion } from '../types'
import type { MesoPhase } from './mesocycle'
import { performancesOf, type Performance } from './history'
import { isStalled } from './stall'
import { roundToLoadable, roundToStep } from './plates'
import { readinessEffect } from './readiness'
import { isBodyweightLoaded } from '../data/exercises'
import type { BodyweightAt } from './bodyweight'

export const WORKING_SETS = 3
/** Never prescribe fewer than this many working sets, deload included. */
const MIN_SETS = 2
/** Cap the accumulation ramp so a long block doesn't run away. */
const MAX_SETS = 5
/** How many past performances the RPE read averages over. */
const RPE_WINDOW = 3
/**
 * Tagged sets that earn a read full trust — two typical sessions' worth. Fewer
 * than that and the jump is scaled back proportionally: a self-report is
 * evidence, not measurement, and one of them is barely evidence at all.
 */
const RPE_FULL_TRUST_SETS = 6
/** Spread, in RPE points, that halves confidence in the mean. */
const RPE_SPREAD_TOLERANCE = 2

const NO_BW: BodyweightAt = () => 0

export interface SuggestOptions {
  /** Resolves bodyweight at a moment, so bodyweight lifts are judged honestly. */
  bwAt?: BodyweightAt
  /** Today's pre-session self-rating, if the readiness check is on. */
  readiness?: ReadinessLevel | null
}

/**
 * Double progression: work up the rep range at a fixed weight; when every set
 * reaches the top of the range, add weight and rebuild from the bottom.
 *
 * Three things bend that baseline:
 *  - **RPE**, read across the last few sessions rather than one, scales the size
 *    of the jump continuously instead of flipping a single "was it easy" switch.
 *  - **A mesocycle phase** ramps prescribed sets through accumulation weeks and
 *    backs load off on the planned deload.
 *  - **Readiness** — a pre-session self-rating — nudges load and set count for
 *    the day, because the log can't see that you slept badly.
 *
 * Stall detection is bodyweight-aware when `bwAt` is given, so pull-ups and dips
 * are judged on total load like everywhere else in the app.
 */
export function suggestFor(
  exercise: Exercise,
  history: Session[],
  settings: Settings,
  phase?: MesoPhase | null,
  options: SuggestOptions = {},
): Suggestion {
  const { bwAt = NO_BW, readiness = null } = options
  const [lo, hi] = exercise.repRange
  const perfs = performancesOf(exercise.id, history)
  const ready = readinessEffect(readiness)

  const sets = clampSets(WORKING_SETS + (phase?.setBias ?? 0) + (ready?.setBias ?? 0))
  const intensity = (phase?.intensity ?? 1) * (ready?.intensity ?? 1)
  const readyNote = ready && ready.note ? ` ${ready.note}` : ''

  if (perfs.length === 0) {
    return {
      weight: 0,
      targetReps: lo,
      sets,
      reason: `First time — pick a weight you could lift ~${hi + 2} times and log ${sets} sets of ${lo}.`,
      kind: 'start',
    }
  }

  const last = perfs[0]
  const topWeight = Math.max(...last.sets.map((s) => s.weight))
  const topSets = last.sets.filter((s) => s.weight === topWeight)

  // A planned deload overrides the progression: everyone backs off together.
  if (phase?.phase === 'deload') {
    const backed = loadableRound(exercise, topWeight * intensity, settings)
    return {
      weight: backed,
      targetReps: lo,
      sets,
      reason: `Deload week — ${Math.round(intensity * 100)}% of ${fmt(topWeight)} kg for ${sets} crisp sets. Recover, don't grind.${readyNote}`,
      kind: 'deload',
    }
  }

  if (isStalled(exercise.id, history, bwAt)) {
    const deloaded = loadableRound(exercise, topWeight * 0.9 * intensity, settings)
    const carried = isBodyweightLoaded(exercise) && bwAt(last.startedAt) > 0
    return {
      weight: deloaded,
      targetReps: lo,
      sets,
      // A stall is the one case where changing the exercise is real advice, so
      // the UI can offer it as a button instead of only mentioning it in prose.
      offerSwap: true,
      reason: carried
        ? `Stalled 3 sessions at ${fmt(topWeight)} kg added, bodyweight counted. Back off to ${fmt(deloaded)} kg and rebuild — or swap to a sibling variation.`
        : `Stalled 3 sessions at ${fmt(topWeight)} kg. Deload to ${fmt(deloaded)} kg and rebuild — or swap to a sibling variation.`,
      kind: 'deload',
    }
  }

  // Every logged set at the top weight has to top the rep range. The bar is the
  // set count actually worked that day (min 2), not a fixed 3 — otherwise a
  // deload week's two hard sets could never earn a jump.
  const requiredTop = Math.max(MIN_SETS, Math.min(WORKING_SETS, last.sets.length))
  const allAtTop = topSets.length >= requiredTop && topSets.every((s) => s.reps >= hi)

  if (allAtTop) {
    const read = recentRpe(perfs)
    const jump = exercise.increment * rpeMultiplier(read)
    const next = loadableRound(exercise, (topWeight + jump) * intensity, settings)
    return {
      weight: next,
      targetReps: lo,
      sets,
      reason: describeJump(read, topWeight, next, hi) + readyNote,
      kind: 'increase',
    }
  }

  const weakest = Math.min(...topSets.map((s) => s.reps))
  const target = Math.min(Math.max(weakest + 1, lo), hi)
  // Hold the exact weight when nothing is backing it off — re-rounding a
  // perfectly good working weight would silently move it.
  const held = intensity === 1 ? topWeight : loadableRound(exercise, topWeight * intensity, settings)
  return {
    weight: held,
    targetReps: target,
    sets,
    reason: `Last time: ${topSets.map((s) => s.reps).join('/')} reps at ${fmt(topWeight)} kg. Beat it — aim for ${target}+ on every set.${readyNote}`,
    kind: 'build',
  }
}

function clampSets(sets: number): number {
  return Math.max(MIN_SETS, Math.min(MAX_SETS, sets))
}

/** What the recent RPE tags add up to, and how much weight that deserves. */
export interface RpeRead {
  /** Mean RPE across the top-weight sets in the window. */
  avg: number
  /** How many tagged sets it averages. Sets logged "not sure" don't count. */
  n: number
  /** Population standard deviation of those tags, in RPE points. */
  spread: number
  /** 0–1. How far from neutral the multiplier is allowed to travel. */
  confidence: number
}

/**
 * Mean RPE across the top-weight sets of the last few performances, with a
 * confidence attached. Sets logged without a reading — "not sure" — are skipped
 * rather than counted as easy, so the read stays honest when only some sets get
 * a number. Null = nothing to read at all.
 *
 * Confidence falls with a thin sample and with a wide one: three sets that all
 * felt like an 8 say something, three that came in at 6, 8 and 10 mostly say the
 * lifter was guessing. It's what keeps a single careless tap from sizing a jump.
 * A consistent read over `RPE_FULL_TRUST_SETS` reaches 1, so the scale's promise
 * — a 7 doubles the jump — is something the engine actually pays out.
 */
export function recentRpe(perfs: Performance[], window = RPE_WINDOW): RpeRead | null {
  const rpes: number[] = []
  for (const p of perfs.slice(0, window)) {
    const top = Math.max(...p.sets.map((s) => s.weight))
    for (const s of p.sets) {
      if (s.weight === top && s.rpe !== undefined) rpes.push(s.rpe)
    }
  }
  if (rpes.length === 0) return null

  const n = rpes.length
  const avg = rpes.reduce((a, b) => a + b, 0) / n
  const spread = Math.sqrt(rpes.reduce((a, r) => a + (r - avg) ** 2, 0) / n)
  const confidence =
    Math.min(1, n / RPE_FULL_TRUST_SETS) * (RPE_SPREAD_TOLERANCE / (RPE_SPREAD_TOLERANCE + spread))
  return { avg, n, spread, confidence }
}

/** The mean alone, for the places that only want to show a number. */
export function recentAvgRpe(perfs: Performance[], window = RPE_WINDOW): number | null {
  return recentRpe(perfs, window)?.avg ?? null
}

/** The rungs of the scale the app asks for, easiest first. */
export const RPE_SCALE = [6, 7, 8, 9, 10] as const

/**
 * What each rung means, in reps left in the tank.
 *
 * The number only sharpens the jumps if it means the same thing every week, and
 * "how hard was that, 6 to 10?" is not a question anyone answers the same way
 * twice unaided. Reps-in-reserve is the anchor that makes it repeatable, so it
 * sits under the picker rather than in a help page nobody opens. The rungs
 * deliberately match `rpeRamp` — what you're told a 7 means is what a 7 does to
 * your next target, once the read has earned full confidence.
 */
export function rpeMeaning(rpe: number): string {
  if (rpe <= 6) return 'easy — four or more reps left in the tank'
  if (rpe <= 7) return 'comfortable — about three reps left'
  if (rpe <= 8) return 'hard but clean — two reps left'
  if (rpe <= 9) return 'one rep left, at most'
  return 'all out — nothing left, form on the edge'
}

/**
 * How many increments an RPE is worth, before confidence is taken into account.
 *
 * A straight line through the rungs the scale already promised: 7 doubles the
 * jump, 8 gives one and a half, 9 the plain increment, 10 half of one. It used
 * to be a step function on those same numbers, which meant a mean of 7.0 doubled
 * your jump while 7.1 gave 1.5× — a cliff that measurement error alone could
 * push you across. Same anchors, no edges between them. Clamped at the top so
 * the bottom rung isn't also the most aggressive thing you can tap.
 */
export function rpeRamp(avgRpe: number): number {
  return Math.max(0.5, Math.min(2, 5.5 - 0.5 * avgRpe))
}

/**
 * How many increments to add once the rep range is topped, as a function of how
 * hard recent sets felt *and* how much that read is worth. A read with nothing
 * behind it lands on 1 — the plain single increment, the conservative default,
 * and what the app did before RPE mattered.
 */
export function rpeMultiplier(read: RpeRead | null): number {
  if (read === null) return 1
  return 1 + (rpeRamp(read.avg) - 1) * read.confidence
}

/** Below this the jump is visibly held back, so the reason owns up to why. */
const RPE_LOW_CONFIDENCE = 0.5

function describeJump(read: RpeRead | null, from: number, to: number, hi: number): string {
  if (read === null) return `All sets hit ${hi} reps at ${fmt(from)} kg — move up to ${fmt(to)} kg.`
  const felt =
    read.avg <= 7 ? 'and it felt easy'
      : read.avg <= 8 ? 'with a rep or two left'
      : read.avg <= 9 ? 'and it was real work'
      : 'but it was a grind'
  const hedge =
    read.confidence >= RPE_LOW_CONFIDENCE ? ''
      : read.spread >= 1 ? ` Those tags disagree with each other, so this one's hedged.`
      : ` Only ${read.n} tagged ${read.n === 1 ? 'set' : 'sets'} behind that, so this one's hedged.`
  return `Topped the range at ${fmt(from)} kg ${felt} (RPE ${read.avg.toFixed(1)} across recent sessions) — go to ${fmt(to)} kg.${hedge}`
}

function loadableRound(exercise: Exercise, weight: number, settings: Settings): number {
  if (exercise.barLoaded) return roundToLoadable(weight, settings.barWeightKg, settings.platesKg)
  const step = Math.min(exercise.increment, 2.5) / 2 >= 1 ? 1 : 0.5
  return roundToStep(weight, step)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}
