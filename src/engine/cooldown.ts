import type { ConditioningMove, Muscle, Session, SessionEntry, SessionKind, Stretch } from '../types'
import { MOBILITY } from '../types'
import { CONDITIONING, setsInScheme } from '../data/conditioning'
import { DESK_RESCUE, STRETCH_GROUPS, type StretchGroup } from '../data/stretches'
import { daysSinceStretched } from './mobility'

/**
 * The post-session cool-down: the three things worth doing while you're still
 * warm, each cut to a five- or ten-minute block you'll actually finish.
 *
 * Nothing here invents new movements. Warm down and posture correction draw on
 * the stretch catalog, core work on the conditioning catalog, so a cool-down
 * logs exactly like the Stretch and Condition tabs and feeds the same staleness,
 * freshness and weekly-volume numbers.
 */
export type CooldownTrack = 'warm-down' | 'posture' | 'core'

export const COOLDOWN_MINUTES = [5, 10] as const
export type CooldownMinutes = (typeof COOLDOWN_MINUTES)[number]

export const COOLDOWN_TRACKS: { id: CooldownTrack; name: string; blurb: string }[] = [
  { id: 'warm-down', name: 'Warm down', blurb: 'Holds for what you just trained' },
  { id: 'posture', name: 'Posture correction', blurb: 'Undo the desk — hips, mid-back, neck' },
  { id: 'core', name: 'Core work', blurb: 'Bracing and spinal-health movements' },
]

export const trackName = (track: CooldownTrack): string =>
  COOLDOWN_TRACKS.find((t) => t.id === track)?.name ?? track

/** Seconds allowed to get into position before each movement. */
export const TRANSITION_SEC = 10
/** Seconds of rest between sets of a conditioning movement. */
export const SET_REST_SEC = 20
/** Assumed seconds per rep, for budgeting a rep-scheme against the clock. */
const SEC_PER_REP = 2.5
/** Assumed seconds per metre of a loaded carry. */
const SEC_PER_METRE = 1
const DAY = 86_400_000

/**
 * How many movements a block of this length is planned around. It sets the
 * share of the clock each one is allowed, not a limit on how many there are —
 * once the planned spread is placed, anything still fitting the remaining time
 * is added, because "5 minutes" that runs for three is not five minutes.
 */
const ITEM_TARGET: Record<CooldownTrack, Record<CooldownMinutes, number>> = {
  'warm-down': { 5: 3, 10: 6 },
  posture: { 5: 3, 10: 6 },
  // Conditioning work is sets with rest between them, so fewer of them fit —
  // and two movements taken properly beat four rushed.
  core: { 5: 2, 10: 4 },
}

const PURPOSE_LABEL = { power: 'Power', core: 'Core', spine: 'Spine' } as const

export interface CooldownItem {
  /** Stretch id or conditioning-move id — both resolve in the logging catalogs. */
  id: string
  kind: 'stretch' | 'conditioning'
  name: string
  /** What to do, in the catalog's own words: "45s / side", "3 × 30 s". */
  prescription: string
  targets: string
  cue: string
  /** Holds (a per-side stretch is two) or sets, after trimming to the budget. */
  sets: number
  /** Seconds of work in one hold or set. */
  workSec: number
  /** Seconds of rest between sets; stretches switch sides without one. */
  restSec: number
  /** Total clock cost, transition included — what the budget is spent on. */
  seconds: number
  /** True when the scheme was cut short to fit the time. */
  trimmed: boolean
}

export interface CooldownPlan {
  track: CooldownTrack
  minutes: CooldownMinutes
  items: CooldownItem[]
  /** Seconds the block actually runs to, which is at most the budget. */
  totalSec: number
}

/** A movement before the budget has decided how much of it fits. */
interface Candidate {
  id: string
  kind: CooldownItem['kind']
  name: string
  prescription: string
  targets: string
  cue: string
  maxSets: number
  workSec: number
  restSec: number
  /**
   * Whether sets may be cut to fit. Conditioning schemes can be; a hold can't —
   * stretching one side of a body and calling it done is worse than skipping it.
   */
  trimmable: boolean
}

/**
 * Time cost of `sets` of a movement, transition included. Every budget decision
 * and the runner's own phase list both come from this one formula, so the block
 * takes as long as the picker promised.
 */
function costOf(c: Pick<Candidate, 'workSec' | 'restSec'>, sets: number): number {
  return TRANSITION_SEC + sets * c.workSec + Math.max(0, sets - 1) * c.restSec
}

/**
 * How long one set of a conditioning scheme takes. The schemes are written for
 * humans ("5 × 15", "3 × 30 s", "4 × 40 m", "3 × 8 / side"), so the number after
 * the × is read in whatever unit follows it, doubled when it's per side.
 */
export function schemeCost(scheme: string): { sets: number; workSec: number } {
  const m = /[×x]\s*(\d+)\s*(s|m)?\b\s*(\/\s*side)?/i.exec(scheme)
  if (!m) return { sets: setsInScheme(scheme), workSec: 45 }
  const amount = Number(m[1])
  const unit = m[2]?.toLowerCase()
  const perSide = m[3] !== undefined
  const per = unit === 's' ? amount : unit === 'm' ? amount * SEC_PER_METRE : amount * SEC_PER_REP
  // A floor, because rep counts alone under-read the slow movements: three
  // get-ups a side is a couple of minutes' work, not fifteen seconds'.
  return { sets: setsInScheme(scheme), workSec: Math.max(20, Math.round(per * (perSide ? 2 : 1))) }
}

function stretchCandidate(s: Stretch): Candidate {
  return {
    id: s.id,
    kind: 'stretch',
    name: s.name,
    prescription: `${s.holdSec}s${s.perSide ? ' / side' : ''}`,
    targets: s.targets,
    cue: s.cue,
    maxSets: s.perSide ? 2 : 1,
    workSec: s.holdSec,
    restSec: 0,
    trimmable: false,
  }
}

function conditioningCandidate(m: ConditioningMove): Candidate {
  const { sets, workSec } = schemeCost(m.scheme)
  return {
    id: m.id,
    kind: 'conditioning',
    name: m.name,
    prescription: m.scheme,
    targets: m.purpose.map((p) => PURPOSE_LABEL[p]).join(' · '),
    cue: m.cue,
    maxSets: sets,
    workSec,
    restSec: SET_REST_SEC,
    trimmable: true,
  }
}

/** Days since a group was stretched, with "never" as a sortable number. */
function staleRank(since: Map<string, number>, id: string): number {
  const d = since.get(id)
  return d === undefined || d === Infinity ? Number.MAX_SAFE_INTEGER : d
}

/**
 * Take one from each list in turn. Three holds picked group-by-group would all
 * come from the chest; picked round-robin they cover the chest, the lats and the
 * triceps you just trained.
 */
function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = []
  const depth = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < depth; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i])
  }
  return out
}

function stretchCandidates(groups: StretchGroup[], history: Session[], now: number): Candidate[] {
  const since = daysSinceStretched(history, now)
  const ordered = [...groups].sort((a, b) => staleRank(since, b.id) - staleRank(since, a.id))
  return roundRobin(ordered.map((g) => g.stretches)).map(stretchCandidate)
}

/** When each conditioning movement was last logged. */
function lastConditioningAt(history: Session[]): Map<string, number> {
  const last = new Map<string, number>()
  for (const s of history) {
    if (s.dayType !== 'conditioning') continue
    for (const e of s.entries) last.set(e.exerciseId, Math.max(last.get(e.exerciseId) ?? 0, s.startedAt))
  }
  return last
}

/**
 * Core and spinal-health work, freshest need first. Power movements are
 * excluded even where they're also tagged core: five sets of heavy swings is a
 * session of its own, and this one is being offered to someone who has just
 * finished theirs. Ties — everything, on a first run — break towards what needs
 * no kit, because the block should be doable on the mat you're standing on.
 */
function coreCandidates(history: Session[], now: number): Candidate[] {
  const last = lastConditioningAt(history)
  return CONDITIONING
    .filter((m) => !m.purpose.includes('power') && (m.purpose.includes('core') || m.purpose.includes('spine')))
    .map((m, i) => {
      const at = last.get(m.id)
      return {
        m,
        i,
        since: at === undefined ? Number.MAX_SAFE_INTEGER : (now - at) / DAY,
        kit: m.equipment === 'bodyweight' ? 0 : 1,
      }
    })
    .sort((a, b) => b.since - a.since || a.kit - b.kit || a.i - b.i)
    .map(({ m }) => conditioningCandidate(m))
}

/**
 * Movements a track can draw on, best first. Warm down follows the muscles just
 * trained (falling back to the whole catalog when a session names none), and
 * every track breaks ties towards whatever has gone longest untouched.
 */
function candidatesFor(
  track: CooldownTrack,
  muscles: Muscle[],
  history: Session[],
  now: number,
): Candidate[] {
  if (track === 'core') return coreCandidates(history, now)
  if (track === 'posture') return stretchCandidates(DESK_RESCUE, history, now)
  const wanted = new Set(muscles)
  const matching = STRETCH_GROUPS.filter((g) => g.muscles.some((m) => wanted.has(m)))
  // A session that hit two muscle groups has only a handful of matching holds,
  // which would leave a ten-minute block three minutes short. The rest of the
  // catalog backs it up — behind everything relevant, never in front of it.
  const rest = STRETCH_GROUPS.filter((g) => !matching.includes(g))
  return [
    ...stretchCandidates(matching, history, now),
    ...stretchCandidates(rest, history, now),
  ]
}

/** The most sets of a movement that fit in `room` seconds; 0 if none do. */
function fittingSets(c: Candidate, room: number, minSets: number): number {
  if (!c.trimmable) return costOf(c, c.maxSets) <= room ? c.maxSets : 0
  for (let n = c.maxSets; n >= minSets; n--) if (costOf(c, n) <= room) return n
  return 0
}

function toItem(c: Candidate, sets: number): CooldownItem {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    // A trimmed scheme is shown as what you're actually being asked to do: the
    // running order saying "3 × 10" while the timer counts two sets is a bug
    // report waiting to happen.
    prescription: sets < c.maxSets ? c.prescription.replace(/^\s*\d+/, String(sets)) : c.prescription,
    targets: c.targets,
    cue: c.cue,
    sets,
    workSec: c.workSec,
    restSec: c.restSec,
    seconds: costOf(c, sets),
    trimmed: sets < c.maxSets,
  }
}

export interface CooldownContext {
  /** Muscles the finished session worked — what a warm down is built around. */
  muscles?: Muscle[]
  history: Session[]
  now: number
}

/**
 * Build a block that fits the minutes on offer. Each movement gets a fair share
 * of what's left, so a block spends its whole budget without a single movement
 * eating it — and the last one soaks up the remainder rather than leaving the
 * clock two minutes short.
 */
export function buildCooldown(
  track: CooldownTrack,
  minutes: CooldownMinutes,
  ctx: CooldownContext,
): CooldownPlan {
  const budget = minutes * 60
  const target = ITEM_TARGET[track][minutes]
  const candidates = candidatesFor(track, ctx.muscles ?? [], ctx.history, ctx.now)

  const items: CooldownItem[] = []
  let used = 0
  for (const c of candidates) {
    const left = budget - used
    if (left <= TRANSITION_SEC) break
    // Until the planned spread is placed, each movement gets an even share of
    // what's left — so the first one can't eat the block. After that, whatever
    // time is still going spare is offered whole to the next candidate.
    const slotsLeft = target - items.length
    const room = slotsLeft > 0 ? Math.max(costOf(c, 1), Math.round(left / slotsLeft)) : left
    // Spending leftover time is worth a movement, not a token: past the planned
    // spread, a conditioning movement earns its place with two sets or not at all.
    const sets = fittingSets(c, Math.min(room, left), slotsLeft > 0 ? 1 : 2)
    if (sets === 0) continue
    items.push(toItem(c, sets))
    used += costOf(c, sets)
  }

  // A block with nothing in it isn't an answer. If even one movement wouldn't
  // fit the budget, offer the shortest thing available anyway.
  if (items.length === 0 && candidates.length > 0) {
    const cheapest = [...candidates].sort((a, b) => costOf(a, 1) - costOf(b, 1))[0]
    items.push(toItem(cheapest, cheapest.trimmable ? 1 : cheapest.maxSets))
    used = items[0].seconds
  }

  return { track, minutes, items, totalSec: used }
}

/** Where a finished cool-down is filed. */
export function cooldownSessionKind(track: CooldownTrack): SessionKind {
  return track === 'core' ? 'conditioning' : MOBILITY
}

/**
 * Log entries for the movements actually completed. Conditioning records the
 * sets it really ran — a trimmed block shouldn't claim the full scheme's hard
 * sets — while a stretch stays a single marker, because mobility is tracked for
 * staleness and never counted as volume.
 */
export function cooldownEntries(items: CooldownItem[]): SessionEntry[] {
  return items.map((item) => ({
    exerciseId: item.id,
    sets: Array.from({ length: item.kind === 'conditioning' ? item.sets : 1 }, () => ({ weight: 0, reps: 1 })),
  }))
}

export interface CooldownPhase {
  /** Index into the plan's items. */
  itemIndex: number
  kind: 'prep' | 'work' | 'rest'
  sec: number
  label: string
}

/**
 * The block as a run of timed phases. Built from the same costs the budget was
 * spent on, so the guided run lasts exactly as long as the plan says.
 */
export function cooldownPhases(items: CooldownItem[]): CooldownPhase[] {
  const phases: CooldownPhase[] = []
  items.forEach((item, itemIndex) => {
    phases.push({ itemIndex, kind: 'prep', sec: TRANSITION_SEC, label: 'Get set' })
    for (let n = 1; n <= item.sets; n++) {
      phases.push({ itemIndex, kind: 'work', sec: item.workSec, label: workLabel(item, n) })
      if (n < item.sets && item.restSec > 0) {
        phases.push({ itemIndex, kind: 'rest', sec: item.restSec, label: 'Rest' })
      }
    }
  })
  return phases
}

function workLabel(item: CooldownItem, n: number): string {
  if (item.kind === 'stretch') return item.sets > 1 ? `Hold — side ${n}` : 'Hold'
  return `Set ${n} of ${item.sets}`
}

/** "4:10" — a block's length, for a button that has to promise something. */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
