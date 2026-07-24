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
 * Any gym day identity — a built-in `DayType` or a user-built custom day's id.
 * The `string & {}` keeps the built-in literals as editor suggestions while
 * still admitting the arbitrary ids the program builder mints.
 */
export type DayId = DayType | (string & {})

/** Sessions cover gym days plus logged conditioning work. */
export type SessionKind = DayId | 'conditioning'

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'kettlebell'

export interface Exercise {
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

export interface Session {
  id?: number
  /** Stable cross-device identity, used as the cloud-sync key. */
  uuid: string
  dayType: SessionKind
  startedAt: number
  finishedAt?: number
  entries: SessionEntry[]
  /** Last local write (create or edit), ms epoch. Drives sync conflict resolution. */
  updatedAt?: number
  /** Soft-delete tombstone, ms epoch. Set = deleted; kept so deletions propagate via sync. */
  deletedAt?: number
}

/** One bodyweight reading, keyed by start-of-day epoch (one entry per day). */
export interface BodyLog {
  at: number
  kg: number
}

export interface Settings {
  id: string
  barWeightKg: number
  /** Plate denominations available, per side, in kg. */
  platesKg: number[]
  soundOn: boolean
  /** Active training block. null/absent = no periodization (session-to-session). */
  meso?: MesoConfig | null
  /** Daily "time to train" nudge. Absent = off. */
  reminder?: ReminderConfig | null
}

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

export interface DayTemplate {
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
export interface Goal {
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
