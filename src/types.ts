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

/** Sessions cover gym days plus logged conditioning work. */
export type SessionKind = DayType | 'conditioning'

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
  dayType: SessionKind
  startedAt: number
  finishedAt?: number
  entries: SessionEntry[]
}

export interface Settings {
  id: string
  barWeightKg: number
  /** Plate denominations available, per side, in kg. */
  platesKg: number[]
  soundOn: boolean
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
  id: DayType
  name: string
  muscles: Muscle[]
  slots: DaySlot[]
}

export interface Stretch {
  id: string
  name: string
  targets: string
  holdSec: number
  perSide: boolean
  cue: string
}

export interface ConditioningMove {
  id: string
  name: string
  equipment: Equipment
  purpose: ('power' | 'core' | 'spine')[]
  scheme: string
  cue: string
}
