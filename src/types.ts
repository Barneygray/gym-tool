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

/** Sessions cover gym days plus logged conditioning work. */
export type SessionKind = DayId | 'conditioning'

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
  cue: string
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

export interface Settings extends SyncMeta {
  id: string
  barWeightKg: number
  /** Plate denominations available, per side, in kg. */
  platesKg: number[]
  soundOn: boolean
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
  scheme: string
  cue: string
}
