import type { Stretch } from '../types'

const st = (
  id: string,
  name: string,
  targets: string,
  holdSec: number,
  perSide: boolean,
  cue: string,
): Stretch => ({ id, name, targets, holdSec, perSide, cue })

export interface StretchGroup {
  id: string
  name: string
  stretches: Stretch[]
}

/** Stretches organised by the muscle groups you train. */
export const STRETCH_GROUPS: StretchGroup[] = [
  {
    id: 'chest-shoulders',
    name: 'Chest & Shoulders',
    stretches: [
      st('doorway-pec', 'Doorway Pec Stretch', 'Chest, front delts', 30, true,
        'Forearm on the frame, elbow at shoulder height, step through until you feel the chest open.'),
      st('cross-body-shoulder', 'Cross-Body Shoulder Stretch', 'Rear delts', 30, true,
        'Pull the arm across your chest with the opposite hand — keep the shoulder down.'),
      st('sleeper-stretch', 'Sleeper Stretch', 'Rotator cuff', 30, true,
        'Side-lying, elbow at 90°, gently press the forearm towards the floor.'),
    ],
  },
  {
    id: 'back-lats',
    name: 'Back & Lats',
    stretches: [
      st('lat-hang', 'Bar Lat Hang', 'Lats, spine decompression', 30, false,
        'Dead hang from a bar, relax the shoulders up to your ears and breathe.'),
      st('childs-pose-reach', "Child's Pose with Side Reach", 'Lats, lower back', 40, true,
        'Sit back on your heels, walk both hands to one side until the opposite lat pulls.'),
      st('thread-the-needle', 'Thread the Needle', 'Mid-back, rear delts', 30, true,
        'From all fours, slide one arm under the other, shoulder to the floor.'),
    ],
  },
  {
    id: 'arms',
    name: 'Arms & Wrists',
    stretches: [
      st('wall-biceps', 'Wall Biceps Stretch', 'Biceps, forearm', 30, true,
        'Palm flat on the wall behind you, fingers back, turn your chest away.'),
      st('overhead-triceps', 'Overhead Triceps Stretch', 'Triceps', 30, true,
        'Elbow to the sky, hand between the shoulder blades, add gentle pressure.'),
      st('wrist-flexor', 'Wrist Flexor Stretch', 'Forearms', 25, true,
        'Arm straight, palm up, gently pull fingers back with the other hand.'),
    ],
  },
  {
    id: 'legs-glutes',
    name: 'Legs & Glutes',
    stretches: [
      st('couch-quad', 'Couch Quad Stretch', 'Quads, hip flexors', 45, true,
        'Rear foot up on a bench or wall, knee down, squeeze the glute and stay tall.'),
      st('standing-ham', 'Standing Hamstring Stretch', 'Hamstrings', 40, true,
        'Heel on a low box, hinge from the hips with a flat back — no rounding.'),
      st('figure-four', 'Figure-Four Stretch', 'Glutes, piriformis', 40, true,
        'On your back, ankle over the opposite knee, pull the thigh towards you.'),
      st('deep-squat-hold', 'Deep Squat Hold', 'Hips, ankles, groin', 45, false,
        'Sink to the bottom of a squat, elbows pushing knees out, chest tall.'),
      st('standing-calf', 'Wall Calf Stretch', 'Calves', 30, true,
        'Back leg straight, heel down, lean into the wall; bend the knee to hit the soleus.'),
    ],
  },
]

/** Follow-along sequences for desk-work damage: sitting, slouching, tech neck. */
export const DESK_RESCUE: StretchGroup[] = [
  {
    id: 'lower-back',
    name: 'Lower Back Reset',
    stretches: [
      st('cat-cow', 'Cat–Cow', 'Whole spine mobility', 45, false,
        'On all fours, alternate slowly between arching and rounding — move with the breath.'),
      st('knee-to-chest', 'Knees to Chest', 'Lower back release', 30, false,
        'On your back, hug both knees in and rock gently side to side.'),
      st('supine-twist', 'Supine Spinal Twist', 'Lower back, obliques', 40, true,
        'Drop both knees to one side, arms wide, shoulders glued to the floor.'),
      st('hip-flexor-lunge', 'Half-Kneeling Hip Flexor Stretch', 'Hip flexors (the sitting muscle)', 45, true,
        'Rear knee down, tuck the pelvis, shift forward — tight hip flexors drag on the lower back.'),
    ],
  },
  {
    id: 'upper-back-neck',
    name: 'Upper Back & Tech Neck',
    stretches: [
      st('chin-tuck', 'Chin Tucks', 'Deep neck flexors', 30, false,
        'Glide the chin straight back to make a double chin, hold two counts, repeat.'),
      st('wall-angel', 'Wall Angels', 'Upper back, shoulder mobility', 45, false,
        'Back and arms against a wall, slide arms up and down without losing contact.'),
      st('thoracic-extension', 'Thoracic Extension over Chair', 'Mid-back extension', 30, false,
        'Hands behind head, arch your upper back over the top of a chair backrest.'),
      st('upper-trap', 'Upper Trap Stretch', 'Neck, upper traps', 30, true,
        'Ear towards shoulder, opposite arm reaching down, add light hand pressure.'),
      st('doorway-pec-desk', 'Doorway Pec Stretch', 'Chest (rounds you forward)', 30, true,
        'Tight pecs pull you into a slouch — open them daily at a door frame.'),
    ],
  },
  {
    id: 'legs-hips',
    name: 'Legs & Hips (Sitting Antidote)',
    stretches: [
      st('worlds-greatest', "World's Greatest Stretch", 'Hips, hamstrings, thoracic', 40, true,
        'Deep lunge, inside hand down, rotate the other arm to the ceiling.'),
      st('pigeon', 'Pigeon Pose', 'Glutes, hip rotators', 60, true,
        'Front shin across, back leg long, fold over the front leg and breathe into the hip.'),
      st('seated-ham-floor', 'Seated Hamstring Fold', 'Hamstrings', 40, false,
        'Legs long, hinge forward from the hips reaching for the feet — back stays long.'),
      st('ankle-rocks', 'Ankle Dorsiflexion Rocks', 'Ankles', 30, true,
        'Half-kneel, drive the front knee over the toes keeping the heel down.'),
    ],
  },
]
