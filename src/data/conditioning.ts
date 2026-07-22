import type { ConditioningMove } from '../types'

const mv = (
  id: string,
  name: string,
  equipment: ConditioningMove['equipment'],
  purpose: ConditioningMove['purpose'],
  scheme: string,
  cue: string,
): ConditioningMove => ({ id, name, equipment, purpose, scheme, cue })

export const CONDITIONING: ConditioningMove[] = [
  // ── Kettlebell power ─────────────────────────────────
  mv('kb-swing', 'Kettlebell Swing', 'kettlebell', ['power', 'spine'], '5 × 15',
    'A hinge, not a squat — snap the hips forward and let the bell float to chest height.'),
  mv('kb-goblet-squat', 'Goblet Squat', 'kettlebell', ['power', 'core'], '4 × 10',
    'Bell at the chest, elbows inside the knees at the bottom, stay tall.'),
  mv('kb-clean-press', 'Kettlebell Clean & Press', 'kettlebell', ['power', 'core'], '4 × 6 / side',
    'Tame the arc on the clean, brace, press without leaning back.'),
  mv('turkish-getup', 'Turkish Get-Up', 'kettlebell', ['core', 'spine'], '3 × 3 / side',
    'Eyes on the bell the whole way up — slow is the point. Total-body control.'),
  mv('farmer-carry', 'Farmer Carry', 'kettlebell', ['core', 'spine'], '4 × 40 m',
    'Heavy bells, tall posture, ribs stacked over hips — walk like nothing is heavy.'),
  mv('kb-snatch', 'Kettlebell Snatch', 'kettlebell', ['power'], '4 × 8 / side',
    'One fluid pull from swing to overhead lockout — punch through at the top.'),

  // ── Plyometric ───────────────────────────────────────
  mv('box-jump', 'Box Jump', 'bodyweight', ['power'], '4 × 5',
    'Explode up, land soft and quiet in a quarter squat, step down — never jump down.'),
  mv('broad-jump', 'Broad Jump', 'bodyweight', ['power'], '4 × 4',
    'Big arm swing, launch forward, stick the landing with knees tracking out.'),
  mv('jump-squat', 'Jump Squat', 'bodyweight', ['power'], '3 × 8',
    'Dip fast, jump max height, absorb quietly — quality over quantity.'),
  mv('med-ball-slam', 'Med Ball Slam', 'bodyweight', ['power', 'core'], '4 × 8',
    'Full extension overhead, slam through the floor with the whole trunk.'),

  // ── Core & spinal health ─────────────────────────────
  mv('dead-bug', 'Dead Bug', 'bodyweight', ['core', 'spine'], '3 × 10 / side',
    'Lower back pressed to the floor throughout — opposite arm and leg reach, exhale hard.'),
  mv('bird-dog', 'Bird Dog', 'bodyweight', ['core', 'spine'], '3 × 8 / side',
    'Reach long, not high. Hips stay square — a cup of tea on your lower back.'),
  mv('plank', 'RKC Plank', 'bodyweight', ['core'], '3 × 30 s',
    'Squeeze glutes and quads, pull elbows to toes — ten hard breaths.'),
  mv('side-plank', 'Side Plank', 'bodyweight', ['core', 'spine'], '3 × 30 s / side',
    'Straight line ear to ankle — the quiet fix for lower-back resilience.'),
  mv('hollow-hold', 'Hollow Body Hold', 'bodyweight', ['core'], '3 × 25 s',
    'Lower back welded to the floor, arms and legs long and low.'),
  mv('glute-bridge-march', 'Glute Bridge March', 'bodyweight', ['core', 'spine'], '3 × 8 / side',
    'Bridge high, then march without letting the hips dip or twist.'),
  mv('ab-wheel', 'Ab Wheel Rollout', 'bodyweight', ['core'], '3 × 8',
    'Tuck the pelvis, roll out only as far as the lower back stays flat.'),
  mv('suitcase-carry', 'Suitcase Carry', 'kettlebell', ['core', 'spine'], '3 × 30 m / side',
    'One heavy bell, dead level shoulders — the obliques fight the lean.'),
]
