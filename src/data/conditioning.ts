import type { ConditioningMove, Exercise, Muscle } from '../types'

const mv = (
  id: string,
  name: string,
  equipment: ConditioningMove['equipment'],
  purpose: ConditioningMove['purpose'],
  primary: Muscle,
  secondary: Muscle[],
  scheme: string,
  cue: string,
): ConditioningMove => ({ id, name, equipment, purpose, primary, secondary, scheme, cue })

export const CONDITIONING: ConditioningMove[] = [
  // ── Kettlebell power ─────────────────────────────────
  mv('kb-swing', 'Kettlebell Swing', 'kettlebell', ['power', 'spine'], 'glutes', ['hamstrings', 'back', 'core'], '5 × 15',
    'A hinge, not a squat — snap the hips forward and let the bell float to chest height.'),
  mv('kb-goblet-squat', 'Goblet Squat', 'kettlebell', ['power', 'core'], 'quads', ['glutes', 'core'], '4 × 10',
    'Bell at the chest, elbows inside the knees at the bottom, stay tall.'),
  mv('kb-clean-press', 'Kettlebell Clean & Press', 'kettlebell', ['power', 'core'], 'shoulders', ['core', 'back', 'quads'], '4 × 6 / side',
    'Tame the arc on the clean, brace, press without leaning back.'),
  mv('turkish-getup', 'Turkish Get-Up', 'kettlebell', ['core', 'spine'], 'core', ['shoulders', 'glutes'], '3 × 3 / side',
    'Eyes on the bell the whole way up — slow is the point. Total-body control.'),
  mv('farmer-carry', 'Farmer Carry', 'kettlebell', ['core', 'spine'], 'core', ['back', 'shoulders'], '4 × 40 m',
    'Heavy bells, tall posture, ribs stacked over hips — walk like nothing is heavy.'),
  mv('kb-snatch', 'Kettlebell Snatch', 'kettlebell', ['power'], 'shoulders', ['glutes', 'back', 'core'], '4 × 8 / side',
    'One fluid pull from swing to overhead lockout — punch through at the top.'),

  // ── Plyometric ───────────────────────────────────────
  mv('box-jump', 'Box Jump', 'bodyweight', ['power'], 'quads', ['glutes', 'calves'], '4 × 5',
    'Explode up, land soft and quiet in a quarter squat, step down — never jump down.'),
  mv('broad-jump', 'Broad Jump', 'bodyweight', ['power'], 'quads', ['glutes', 'hamstrings'], '4 × 4',
    'Big arm swing, launch forward, stick the landing with knees tracking out.'),
  mv('jump-squat', 'Jump Squat', 'bodyweight', ['power'], 'quads', ['glutes', 'calves'], '3 × 8',
    'Dip fast, jump max height, absorb quietly — quality over quantity.'),
  mv('med-ball-slam', 'Med Ball Slam', 'bodyweight', ['power', 'core'], 'core', ['back', 'shoulders'], '4 × 8',
    'Full extension overhead, slam through the floor with the whole trunk.'),

  // ── Core & spinal health ─────────────────────────────
  mv('dead-bug', 'Dead Bug', 'bodyweight', ['core', 'spine'], 'core', [], '3 × 10 / side',
    'Lower back pressed to the floor throughout — opposite arm and leg reach, exhale hard.'),
  mv('bird-dog', 'Bird Dog', 'bodyweight', ['core', 'spine'], 'core', ['glutes', 'back'], '3 × 8 / side',
    'Reach long, not high. Hips stay square — a cup of tea on your lower back.'),
  mv('plank', 'RKC Plank', 'bodyweight', ['core'], 'core', [], '3 × 30 s',
    'Squeeze glutes and quads, pull elbows to toes — ten hard breaths.'),
  mv('side-plank', 'Side Plank', 'bodyweight', ['core', 'spine'], 'core', [], '3 × 30 s / side',
    'Straight line ear to ankle — the quiet fix for lower-back resilience.'),
  mv('hollow-hold', 'Hollow Body Hold', 'bodyweight', ['core'], 'core', [], '3 × 25 s',
    'Lower back welded to the floor, arms and legs long and low.'),
  mv('glute-bridge-march', 'Glute Bridge March', 'bodyweight', ['core', 'spine'], 'glutes', ['core', 'hamstrings'], '3 × 8 / side',
    'Bridge high, then march without letting the hips dip or twist.'),
  mv('ab-wheel', 'Ab Wheel Rollout', 'bodyweight', ['core'], 'core', ['back'], '3 × 8',
    'Tuck the pelvis, roll out only as far as the lower back stays flat.'),
  mv('suitcase-carry', 'Suitcase Carry', 'kettlebell', ['core', 'spine'], 'core', ['back', 'shoulders'], '3 × 30 m / side',
    'One heavy bell, dead level shoulders — the obliques fight the lean.'),
]

/**
 * How many sets a scheme prescribes — every scheme in this file leads with its
 * set count ("5 × 15", "3 × 30 s", "4 × 40 m"). Logging that many sets rather
 * than a single "done" marker is what makes a swing session read as five hard
 * sets of posterior chain in the weekly volume charts instead of one.
 */
export function setsInScheme(scheme: string): number {
  const n = Number(/^\s*(\d+)/.exec(scheme)?.[1])
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 1
}

/**
 * Conditioning moves as catalog entries, so logged sessions resolve to a real
 * name and feed muscle freshness, weekly hard sets, and the coach. They are
 * deliberately kept out of `EXERCISES`: the progression engine, warm-up ramps
 * and swap pickers are all about prescribable gym lifts, and a Turkish get-up
 * has no business being handed a target weight.
 *
 * The load-bearing fields are `primary`/`secondary`; the rest exist only to
 * satisfy the shared shape. `conditioning: true` keeps bodyweight out of their
 * effective load, so a plank contributes hard sets without inventing tonnage.
 */
export const CONDITIONING_EXERCISES: Exercise[] = CONDITIONING.map((m) => ({
  id: m.id,
  name: m.name,
  primary: m.primary,
  secondary: m.secondary,
  equipment: m.equipment,
  variationGroup: `conditioning-${m.id}`,
  repRange: [1, 1],
  increment: 0,
  restSec: 60,
  isCompound: false,
  barLoaded: false,
  conditioning: true,
  cue: m.cue,
}))

export const CONDITIONING_IDS = new Set(CONDITIONING.map((m) => m.id))

export function isConditioningMove(id: string): boolean {
  return CONDITIONING_IDS.has(id)
}
