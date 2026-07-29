export type Muscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'

export type DayType = 'push' | 'pull' | 'legs' | 'shoulders-arms' | 'chest-back'

/**
 * Sync bookkeeping shared by every record that reaches the cloud. `updatedAt`
 * is the last local write and drives last-write-wins reconciliation;
 * `deletedAt` is a tombstone kept in place of a hard delete so removals
 * propagate to other devices instead of being resurrected by the next pull.
 */
export interface SyncMeta {
  updatedAt?: number
  deletedAt?: number
}

/**
 * Any gym day identity — a built-in `DayType` or a user-built custom day's id.
 * The `string & {}` keeps the built-in literals as editor suggestions while
 * still admitting the arbitrary ids the program builder mints.
 */
export type DayId = DayType | (string & {})

/** Sessions cover gym days plus logged conditioning and mobility work. */
export type SessionKind = DayId | 'conditioning' | 'mobility'

/** Logged stretching. Tracked for staleness, deliberately not for volume. */
export const MOBILITY = 'mobility'

/**
 * The pseudo-day for an unplanned session: no template, no prescribed
 * exercises — you build it as you go. Stored like any other `dayType`.
 */
export const FREESTYLE = 'freestyle'

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'kettlebell'

/**
 * What a logged weight refers to on hand-held equipment, where "40 kg" says
 * nothing until you know whether it means the pair or one bell.
 *
 * 'per-hand' — a bell in each hand; the logged weight is ONE of them, which is
 *   how everyone quotes dumbbell work ("dumbbell bench at 40" means two 40s)
 *   and what the increments and rounding in this app assume.
 * 'single' — one bell in play, whether that's one-armed work or two hands
 *   under a single dumbbell; the logged weight is that bell.
 *
 * Nothing in the math branches on this — it exists so the app can say which
 * one it means everywhere a dumbbell weight is shown or typed in.
 */
export type LoadBasis = 'per-hand' | 'single'

export interface Exercise extends SyncMeta {
  id: string
  name: string
  primary: Muscle
  secondary: Muscle[]
  equipment: Equipment
  /** Exercises sharing a variationGroup are interchangeable stimulus variations. */
  variationGroup: string
  repRange: [number, number]
  /** kg added when the top of the rep range is reached on all sets. */
  increment: number
  restSec: number
  isCompound: boolean
  /** Loaded on a bar — enables plate math and percentage warm-ups. */
  barLoaded: boolean
  /**
   * Hand-held load convention; see `LoadBasis`. Absent on a dumbbell or
   * kettlebell lift means 'per-hand', and it means nothing at all on bars,
   * cables and machines — so read it through `loadBasisOf`, not directly.
   */
  loadBasis?: LoadBasis
  cue: string
  /**
   * Conditioning work rather than a prescribable gym lift. These live in the
   * lookup catalog so logged sessions resolve — and so they count toward muscle
   * freshness and weekly hard sets — but stay out of `EXERCISES`, so the
   * progression engine never prescribes a Turkish get-up for 3×8.
   */
  conditioning?: boolean
}

export interface SetLog {
  weight: number
  reps: number
  rpe?: number
  note?: string
}

export interface SessionEntry {
  exerciseId: string
  sets: SetLog[]
}

export interface Session extends SyncMeta {
  id?: number
  /** Stable cross-device identity, used as the cloud-sync key. */
  uuid: string
  dayType: SessionKind
  startedAt: number
  finishedAt?: number
  entries: SessionEntry[]
  /** How the trainee rated their readiness before starting. Absent = not asked. */
  readiness?: ReadinessLevel
  /** Which gym this was logged at, for provenance. */
  profileId?: string
}

/** One bodyweight reading, keyed by start-of-day epoch (one entry per day). */
export interface BodyLog extends SyncMeta {
  at: number
  kg: number
}

/**
 * A week's training layout: seven entries, Monday→Sunday. Each is the id of
 * the day template scheduled then, or null for a rest day. Custom days are
 * first-class here — the plan holds `DayId`s, not just the built-in five.
 */
export type WeekPlan = (DayId | null)[]

/**
 * A gym's equipment. Bar weight and plate denominations decide what weights are
 * actually loadable, which is why they drive plate math, warm-up rungs and the
 * rounding of every barbell suggestion. One global pair only ever describes one
 * gym; travel, or train at home as well, and the numbers quietly stop matching
 * the room you're standing in.
 */
export interface EquipmentProfile {
  id: string
  name: string
  barWeightKg: number
  /** Plate denominations available, per side, in kg. */
  platesKg: number[]
  /** Exercise ids this gym can't do — hidden from pickers and rotation. */
  unavailable?: string[]
}

export interface Settings extends SyncMeta {
  id: string
  /**
   * The active profile's equipment, mirrored here so every engine keeps reading
   * one obvious place. `applyActiveProfile` keeps these in step; with no
   * profiles configured they're simply the only equipment there is.
   */
  barWeightKg: number
  /** Plate denominations available, per side, in kg. */
  platesKg: number[]
  soundOn: boolean
  /** Named gyms. Absent/empty = a single implicit profile from the fields above. */
  profiles?: EquipmentProfile[]
  activeProfileId?: string
  /** Set once the first-run flow has been completed or skipped. */
  onboardedAt?: number
  /** Active training block. null/absent = no periodization (session-to-session). */
  meso?: MesoConfig | null
  /** Daily "time to train" nudge. Absent = off. */
  reminder?: ReminderConfig | null
  /** Target gym sessions per week; drives the automatic weekly plan. Absent = default (4). */
  weeklyFrequency?: number
  /**
   * Hand-built Mon→Sun plan. Absent = derive one from `weeklyFrequency` and
   * the built-in split, which is what the app did before plans were editable.
   */
  weekPlan?: WeekPlan | null
  /** Ask how you're feeling before each session and autoregulate on it. */
  readinessCheck?: boolean
  /**
   * Exercise ids you never want prescribed — the lifts you don't do, full stop.
   * Kept out of the rotation, the swap suggestions and the add lists on every
   * gym and every device. Distinct from a profile's `unavailable`, which is
   * about what one room happens to have on the floor.
   */
  excluded?: string[]
}

/** Pre-session self-rating that autoregulates the day's prescription. */
export type ReadinessLevel = 'fresh' | 'normal' | 'beat'

/**
 * A mesocycle: a repeating block of `weeks` where accumulation weeks ramp
 * volume and the final week is a planned deload. Device-local, not cloud-synced.
 */
export interface MesoConfig {
  /** Epoch (ms) at which week 1 of the block began. */
  startAt: number
  /** Total weeks per cycle, deload included. Minimum 3. */
  weeks: number
}

export interface ReminderConfig {
  /** Local hour of day (0–23) to nudge if you haven't trained yet. */
  hour: number
}

export interface Suggestion {
  weight: number
  targetReps: number
  sets: number
  /** Human explanation of why this target was chosen. */
  reason: string
  kind: 'increase' | 'build' | 'start' | 'deload'
  /** Set on a stall, where swapping to a sibling variation is real advice. */
  offerSwap?: boolean
}

export interface DaySlot {
  muscle: Muscle
  pool: string[]
}

export interface DayTemplate extends SyncMeta {
  id: DayId
  name: string
  muscles: Muscle[]
  slots: DaySlot[]
  /** Set on user-built days; built-in templates leave it undefined. */
  custom?: boolean
}

export interface Stretch {
  id: string
  name: string
  targets: string
  holdSec: number
  perSide: boolean
  cue: string
}

/** A strength goal: reach `targetE1rm` on an exercise, optionally by a date. */
export interface Goal extends SyncMeta {
  id: string
  exerciseId: string
  /** Target estimated 1RM in kg. */
  targetE1rm: number
  createdAt: number
  /** Optional deadline (epoch ms) to pace against. */
  targetDate?: number
  /** Set when first reached (epoch ms), so hit goals stay celebrated. */
  achievedAt?: number
}

export interface ConditioningMove {
  id: string
  name: string
  equipment: Equipment
  purpose: ('power' | 'core' | 'spine')[]
  /** Muscles worked — conditioning counts toward freshness and weekly sets too. */
  primary: Muscle
  secondary: Muscle[]
  scheme: string
  cue: string
}
