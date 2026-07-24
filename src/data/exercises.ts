import type { Exercise } from '../types'

const ex = (
  id: string,
  name: string,
  primary: Exercise['primary'],
  secondary: Exercise['secondary'],
  equipment: Exercise['equipment'],
  variationGroup: string,
  repRange: [number, number],
  increment: number,
  restSec: number,
  isCompound: boolean,
  cue: string,
): Exercise => ({
  id,
  name,
  primary,
  secondary,
  equipment,
  variationGroup,
  repRange,
  increment,
  restSec,
  isCompound,
  barLoaded: equipment === 'barbell',
  cue,
})

export const BUILTIN_EXERCISES: Exercise[] = [
  // ── Chest ─────────────────────────────────────────────
  ex('bench-press', 'Barbell Bench Press', 'chest', ['triceps', 'shoulders'], 'barbell', 'horizontal-press', [5, 8], 2.5, 180, true,
    'Shoulder blades pinned, feet planted, bar to mid-chest, drive up and slightly back.'),
  ex('db-bench-press', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders'], 'dumbbell', 'horizontal-press', [8, 12], 2, 150, true,
    'Deeper stretch than the bar — let the bells sink level with your chest, press in a slight arc.'),
  ex('machine-chest-press', 'Machine Chest Press', 'chest', ['triceps'], 'machine', 'horizontal-press', [8, 12], 2.5, 120, true,
    'Grip at nipple height, squeeze the chest to move the handles, slow negative.'),
  ex('incline-bb-press', 'Incline Barbell Press', 'chest', ['shoulders', 'triceps'], 'barbell', 'incline-press', [6, 10], 2.5, 180, true,
    '30° bench. Bar touches just below the collarbone, elbows ~45° from torso.'),
  ex('incline-db-press', 'Incline Dumbbell Press', 'chest', ['shoulders', 'triceps'], 'dumbbell', 'incline-press', [8, 12], 2, 150, true,
    'Upper-chest focus: press up and slightly together, full stretch at the bottom.'),
  ex('cable-fly', 'Cable Fly', 'chest', [], 'cable', 'chest-fly', [10, 15], 2.5, 90, false,
    'Slight elbow bend held constant — hug a barrel, squeeze hands together at the midline.'),
  ex('pec-deck', 'Pec Deck Fly', 'chest', [], 'machine', 'chest-fly', [10, 15], 2.5, 90, false,
    'Elbows just below shoulder height, open to a comfortable stretch, pause the squeeze.'),
  ex('weighted-dip', 'Weighted Dip', 'chest', ['triceps', 'shoulders'], 'bodyweight', 'chest-dip', [6, 10], 2.5, 150, true,
    'Lean forward, elbows track back, descend until shoulders are level with elbows.'),

  // ── Back ──────────────────────────────────────────────
  ex('deadlift', 'Deadlift', 'back', ['hamstrings', 'glutes'], 'barbell', 'hip-hinge', [3, 6], 5, 240, true,
    'Brace hard, bar against shins, push the floor away — hips and shoulders rise together.'),
  ex('barbell-row', 'Barbell Row', 'back', ['biceps'], 'barbell', 'horizontal-pull', [6, 10], 2.5, 180, true,
    'Hinge to ~45°, pull the bar to your lower ribs, squeeze the blades, no torso heave.'),
  ex('db-row', 'One-Arm Dumbbell Row', 'back', ['biceps'], 'dumbbell', 'horizontal-pull', [8, 12], 2, 120, true,
    'Long arm stretch at the bottom, drive the elbow to your hip, not your armpit.'),
  ex('seated-cable-row', 'Seated Cable Row', 'back', ['biceps'], 'cable', 'horizontal-pull', [8, 12], 2.5, 120, true,
    'Chest tall, pull to the sternum, let the weight stretch you forward under control.'),
  ex('chest-supported-row', 'Chest-Supported Row', 'back', ['biceps'], 'machine', 'horizontal-pull', [8, 12], 2.5, 120, true,
    'Chest glued to the pad kills momentum — pure upper-back work. Squeeze for a beat.'),
  ex('pull-up', 'Weighted Pull-Up', 'back', ['biceps'], 'bodyweight', 'vertical-pull', [5, 10], 2.5, 180, true,
    'Full hang to chin over bar. Lead with the chest, think elbows to hips.'),
  ex('lat-pulldown', 'Lat Pulldown', 'back', ['biceps'], 'cable', 'vertical-pull', [8, 12], 2.5, 120, true,
    'Slight lean back, pull the bar to the top of the chest, control the stretch up.'),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back', [], 'cable', 'lat-isolation', [10, 15], 2.5, 90, false,
    'Arms nearly straight, sweep the bar to your thighs — feel the lats, not the triceps.'),

  // ── Shoulders ─────────────────────────────────────────
  ex('overhead-press', 'Overhead Press', 'shoulders', ['triceps'], 'barbell', 'vertical-press', [5, 8], 2.5, 180, true,
    'Squeeze glutes, ribs down, press slightly back so the bar finishes over mid-foot.'),
  ex('seated-db-press', 'Seated Dumbbell Press', 'shoulders', ['triceps'], 'dumbbell', 'vertical-press', [8, 12], 2, 150, true,
    'Start at collarbone height, press up without flaring the ribs, full lockout.'),
  ex('arnold-press', 'Arnold Press', 'shoulders', ['triceps'], 'dumbbell', 'vertical-press', [8, 12], 2, 150, true,
    'Rotate palms from facing you to facing forward as you press — long delt arc.'),
  ex('lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', [], 'dumbbell', 'lateral-raise', [10, 15], 1, 90, false,
    'Lead with the elbows, tip the pinkies slightly up, stop at shoulder height.'),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'shoulders', [], 'cable', 'lateral-raise', [10, 15], 1.25, 90, false,
    'Constant tension from the bottom — stand tall, raise out and slightly forward.'),
  ex('face-pull', 'Face Pull', 'shoulders', ['back'], 'cable', 'rear-delt', [12, 15], 1.25, 90, false,
    'Rope at face height, pull towards your eyes while externally rotating — thumbs back.'),
  ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', ['back'], 'dumbbell', 'rear-delt', [12, 15], 1, 90, false,
    'Hinge over, soft elbows, sweep the bells wide — no shrugging into the traps.'),

  // ── Triceps ───────────────────────────────────────────
  ex('close-grip-bench', 'Close-Grip Bench Press', 'triceps', ['chest', 'shoulders'], 'barbell', 'triceps-press', [6, 10], 2.5, 150, true,
    'Hands just inside shoulder width, elbows tucked, bar to lower chest.'),
  ex('cable-pushdown', 'Cable Pushdown', 'triceps', [], 'cable', 'triceps-extension', [10, 15], 2.5, 90, false,
    'Elbows pinned to your sides, full lockout, control the rise to 90°.'),
  ex('skull-crusher', 'EZ-Bar Skull Crusher', 'triceps', [], 'barbell', 'triceps-overhead', [8, 12], 2.5, 120, false,
    'Lower the bar behind the crown of your head — keep the upper arms still.'),
  ex('overhead-cable-ext', 'Overhead Cable Extension', 'triceps', [], 'cable', 'triceps-overhead', [10, 15], 2.5, 90, false,
    'Face away, elbows by your ears — the deep stretch is where the growth is.'),
  ex('db-overhead-ext', 'Dumbbell Overhead Extension', 'triceps', [], 'dumbbell', 'triceps-overhead', [10, 15], 2, 90, false,
    'Both hands under one bell, lower behind the head, keep elbows pointing up.'),

  // ── Biceps ────────────────────────────────────────────
  ex('barbell-curl', 'Barbell Curl', 'biceps', [], 'barbell', 'biceps-curl', [8, 12], 2.5, 90, false,
    'Elbows at your sides, curl without swinging, lower for a slow three-count.'),
  ex('db-curl', 'Alternating Dumbbell Curl', 'biceps', [], 'dumbbell', 'biceps-curl', [8, 12], 1, 90, false,
    'Supinate as you curl — pinky rotates towards the ceiling at the top.'),
  ex('cable-curl', 'Cable Curl', 'biceps', [], 'cable', 'biceps-curl', [10, 15], 1.25, 90, false,
    'Constant tension top to bottom — don’t let the stack touch down between reps.'),
  ex('incline-db-curl', 'Incline Dumbbell Curl', 'biceps', [], 'dumbbell', 'biceps-stretch-curl', [10, 12], 1, 90, false,
    'Lie back at 45°, arms hanging behind you — curl from the deepest stretch.'),
  ex('preacher-curl', 'Preacher Curl', 'biceps', [], 'machine', 'biceps-stretch-curl', [10, 12], 2.5, 90, false,
    'Armpits over the pad, full extension at the bottom without unloading.'),
  ex('hammer-curl', 'Hammer Curl', 'biceps', [], 'dumbbell', 'hammer-curl', [8, 12], 1, 90, false,
    'Neutral grip builds the brachialis — curl across slightly towards the midline.'),

  // ── Legs ──────────────────────────────────────────────
  ex('back-squat', 'Barbell Back Squat', 'quads', ['glutes', 'hamstrings'], 'barbell', 'squat', [5, 8], 2.5, 240, true,
    'Brace before you descend, knees track over toes, hit depth, drive the floor apart.'),
  ex('front-squat', 'Front Squat', 'quads', ['glutes', 'core'], 'barbell', 'squat', [5, 8], 2.5, 210, true,
    'Elbows high, torso vertical — the bar rides the front delts, not the wrists.'),
  ex('leg-press', 'Leg Press', 'quads', ['glutes'], 'machine', 'leg-press', [8, 12], 5, 150, true,
    'Feet mid-platform, lower until thighs meet ribs, never lock the knees hard.'),
  ex('hack-squat', 'Hack Squat', 'quads', ['glutes'], 'machine', 'leg-press', [8, 12], 5, 180, true,
    'Back flat on the pad, sink deep — the machine lets you push the quads safely.'),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', ['glutes'], 'dumbbell', 'lunge', [8, 12], 2, 120, true,
    'Rear foot on the bench, drop the back knee straight down, drive through the front heel.'),
  ex('walking-lunge', 'Walking Lunge', 'quads', ['glutes'], 'dumbbell', 'lunge', [10, 12], 2, 120, true,
    'Long strides for glutes, controlled knee touch, stay tall through the step.'),
  ex('leg-extension', 'Leg Extension', 'quads', [], 'machine', 'quad-isolation', [10, 15], 2.5, 90, false,
    'Toes up, full squeeze at the top for a beat, resist all the way down.'),
  ex('romanian-deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'barbell', 'hip-hinge', [8, 10], 2.5, 180, true,
    'Soft knees, push the hips back until the hamstrings scream, bar shaved down the thighs.'),
  ex('lying-leg-curl', 'Lying Leg Curl', 'hamstrings', [], 'machine', 'ham-curl', [10, 15], 2.5, 90, false,
    'Hips pressed into the pad, curl to full contraction, three-count negative.'),
  ex('seated-leg-curl', 'Seated Leg Curl', 'hamstrings', [], 'machine', 'ham-curl', [10, 15], 2.5, 90, false,
    'Seated position stretches the hams at the hip — the better growth angle. Slow reps.'),
  ex('hip-thrust', 'Barbell Hip Thrust', 'glutes', ['hamstrings'], 'barbell', 'hip-thrust', [8, 12], 5, 150, true,
    'Shoulders on the bench, chin tucked, squeeze to a full lockout — posterior tilt at the top.'),
  ex('standing-calf-raise', 'Standing Calf Raise', 'calves', [], 'machine', 'calf-raise', [8, 12], 2.5, 90, false,
    'Full stretch at the bottom for two counts, drive up onto the big toe.'),
  ex('seated-calf-raise', 'Seated Calf Raise', 'calves', [], 'machine', 'calf-raise', [12, 15], 2.5, 90, false,
    'Bent knee targets the soleus — pause hard at both ends of the rep.'),

  // ── Core (gym) ────────────────────────────────────────
  ex('cable-crunch', 'Cable Crunch', 'core', [], 'cable', 'ab-flexion', [10, 15], 2.5, 90, false,
    'Kneel, rope by your ears, crunch the ribs to the pelvis — hips stay still.'),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'core', [], 'bodyweight', 'ab-flexion', [8, 15], 2.5, 90, false,
    'No swing: tilt the pelvis and curl the legs up, lower dead slow.'),
]

/** Ids of the curated built-in catalog, so custom lifts can be told apart. */
export const BUILTIN_IDS = new Set(BUILTIN_EXERCISES.map((e) => e.id))

/**
 * The live catalog = built-ins plus any user-defined exercises. These are
 * reassigned (not mutated) by `registerCustomExercises`; ES module live
 * bindings mean every importer sees the updated array/map after registration.
 */
export let EXERCISES: Exercise[] = [...BUILTIN_EXERCISES]
export let exerciseById = new Map(EXERCISES.map((e) => [e.id, e]))

/** Merge the user's custom exercises into the live catalog (call once on load). */
export function registerCustomExercises(custom: Exercise[]): void {
  const cleaned = custom.filter((e) => !BUILTIN_IDS.has(e.id))
  EXERCISES = [...BUILTIN_EXERCISES, ...cleaned]
  exerciseById = new Map(EXERCISES.map((e) => [e.id, e]))
}

export function isCustomExercise(id: string): boolean {
  return !BUILTIN_IDS.has(id)
}

/**
 * Bodyweight-loaded lifts carry the trainee's own weight, so a logged "weight"
 * is *added* load — real load is bodyweight + added (see engine/bodyweight).
 */
export function isBodyweightLoaded(exercise: Exercise): boolean {
  return exercise.equipment === 'bodyweight'
}

export function getExercise(id: string): Exercise {
  const found = exerciseById.get(id)
  if (!found) throw new Error(`Unknown exercise: ${id}`)
  return found
}

/** Build a custom Exercise from a partial form, filling sensible defaults. */
export function makeCustomExercise(input: {
  id?: string
  name: string
  primary: Exercise['primary']
  secondary?: Exercise['secondary']
  equipment: Exercise['equipment']
  repRange?: [number, number]
  increment?: number
  restSec?: number
  isCompound?: boolean
  cue?: string
}): Exercise {
  return {
    id: input.id ?? `custom-${crypto.randomUUID()}`,
    name: input.name.trim(),
    primary: input.primary,
    secondary: input.secondary ?? [],
    equipment: input.equipment,
    variationGroup: input.id ?? `custom-${input.name.trim().toLowerCase().replace(/\s+/g, '-')}`,
    repRange: input.repRange ?? [8, 12],
    increment: input.increment ?? (input.equipment === 'barbell' ? 2.5 : 2),
    restSec: input.restSec ?? (input.isCompound ? 150 : 90),
    isCompound: input.isCompound ?? false,
    barLoaded: input.equipment === 'barbell',
    cue: input.cue?.trim() ?? '',
  }
}
