import type { DayTemplate } from '../types'

/**
 * Each slot carries a pool of interchangeable exercises; the rotation engine
 * alternates through the pool between sessions and any pick can be swapped
 * for another exercise in its pool (or same primary muscle).
 */
export const BUILTIN_DAYS: DayTemplate[] = [
  {
    id: 'push',
    name: 'Push',
    muscles: ['chest', 'shoulders', 'triceps'],
    slots: [
      { muscle: 'chest', pool: ['bench-press', 'db-bench-press', 'machine-chest-press'] },
      { muscle: 'chest', pool: ['incline-db-press', 'incline-bb-press'] },
      { muscle: 'shoulders', pool: ['overhead-press', 'seated-db-press'] },
      { muscle: 'shoulders', pool: ['lateral-raise', 'cable-lateral-raise'] },
      { muscle: 'triceps', pool: ['cable-pushdown', 'skull-crusher'] },
      { muscle: 'triceps', pool: ['overhead-cable-ext', 'db-overhead-ext'] },
    ],
  },
  {
    id: 'pull',
    name: 'Pull',
    muscles: ['back', 'biceps'],
    slots: [
      { muscle: 'back', pool: ['deadlift', 'barbell-row'] },
      { muscle: 'back', pool: ['pull-up', 'lat-pulldown'] },
      { muscle: 'back', pool: ['seated-cable-row', 'chest-supported-row', 'db-row'] },
      { muscle: 'shoulders', pool: ['face-pull', 'rear-delt-fly'] },
      { muscle: 'biceps', pool: ['barbell-curl', 'db-curl', 'cable-curl'] },
      { muscle: 'biceps', pool: ['hammer-curl', 'incline-db-curl', 'preacher-curl'] },
    ],
  },
  {
    id: 'legs',
    name: 'Legs',
    muscles: ['quads', 'hamstrings', 'glutes', 'calves'],
    slots: [
      { muscle: 'quads', pool: ['back-squat', 'front-squat'] },
      { muscle: 'quads', pool: ['leg-press', 'hack-squat'] },
      { muscle: 'hamstrings', pool: ['romanian-deadlift'] },
      { muscle: 'hamstrings', pool: ['lying-leg-curl', 'seated-leg-curl'] },
      { muscle: 'glutes', pool: ['hip-thrust', 'bulgarian-split-squat', 'walking-lunge'] },
      { muscle: 'calves', pool: ['standing-calf-raise', 'seated-calf-raise'] },
    ],
  },
  {
    id: 'shoulders-arms',
    name: 'Shoulders & Arms',
    muscles: ['shoulders', 'biceps', 'triceps'],
    slots: [
      { muscle: 'shoulders', pool: ['overhead-press', 'arnold-press', 'seated-db-press'] },
      { muscle: 'shoulders', pool: ['lateral-raise', 'cable-lateral-raise'] },
      { muscle: 'shoulders', pool: ['face-pull', 'rear-delt-fly'] },
      { muscle: 'triceps', pool: ['close-grip-bench', 'cable-pushdown'] },
      { muscle: 'biceps', pool: ['barbell-curl', 'incline-db-curl', 'cable-curl'] },
      { muscle: 'triceps', pool: ['skull-crusher', 'overhead-cable-ext'] },
      { muscle: 'biceps', pool: ['hammer-curl', 'preacher-curl'] },
    ],
  },
  {
    id: 'chest-back',
    name: 'Chest & Back',
    muscles: ['chest', 'back'],
    slots: [
      { muscle: 'chest', pool: ['bench-press', 'db-bench-press'] },
      { muscle: 'back', pool: ['barbell-row', 'chest-supported-row'] },
      { muscle: 'chest', pool: ['incline-db-press', 'incline-bb-press'] },
      { muscle: 'back', pool: ['pull-up', 'lat-pulldown'] },
      { muscle: 'chest', pool: ['cable-fly', 'pec-deck', 'weighted-dip'] },
      { muscle: 'back', pool: ['seated-cable-row', 'straight-arm-pulldown'] },
    ],
  },
]

/** Ids of the built-in split, so custom days can be told apart and protected. */
export const BUILTIN_DAY_IDS = new Set(BUILTIN_DAYS.map((d) => d.id))

/**
 * The live split = built-in days plus any user-built ones. Reassigned (not
 * mutated) by `registerCustomDays`; ES-module live bindings mean every importer
 * sees the update — the same trick the exercise catalog uses.
 */
export let DAYS: DayTemplate[] = [...BUILTIN_DAYS]
export let dayById = new Map(DAYS.map((d) => [d.id, d]))

/** Merge the user's custom days into the live split (call once on load). */
export function registerCustomDays(custom: DayTemplate[]): void {
  const cleaned = custom
    .filter((d) => !BUILTIN_DAY_IDS.has(d.id))
    .map((d) => ({ ...d, custom: true as const }))
  DAYS = [...BUILTIN_DAYS, ...cleaned]
  dayById = new Map(DAYS.map((d) => [d.id, d]))
}

export function isCustomDay(id: string): boolean {
  return !BUILTIN_DAY_IDS.has(id)
}

/** Build a custom day from a name + slots, deriving its muscle list. */
export function makeCustomDay(input: {
  id?: string
  name: string
  slots: DayTemplate['slots']
}): DayTemplate {
  const muscles: DayTemplate['muscles'] = []
  for (const slot of input.slots) {
    if (!muscles.includes(slot.muscle)) muscles.push(slot.muscle)
  }
  return {
    id: input.id ?? `day-${crypto.randomUUID()}`,
    name: input.name.trim(),
    muscles,
    slots: input.slots,
    custom: true,
  }
}
