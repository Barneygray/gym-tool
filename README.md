# Forge — personal gym helper

A minimalist, offline-first PWA for optimizing gains: log your sets, and Forge
tells you exactly what to lift next.

## What it does

- **Five gym days** — Push, Pull, Legs, Shoulders & Arms, Chest & Back — each
  with a curated pool of 2–3 exercises per muscle group. Variations rotate
  automatically between sessions for a varied growth stimulus, and any pick can
  be swapped for a like exercise, added, or dropped before you start.
- **Custom exercises** — add the machines and variations your gym actually has
  (Setup → Exercises). Custom lifts are first-class: they show up as swap and
  add options and get the same progression engine, warm-ups, e1RM trend, and PR
  tracking as the built-ins.
- **Progressive overload engine (double progression)** — each exercise has a rep
  range; you add reps at a fixed weight until every set tops the range, then the
  app bumps the weight and you rebuild. Logging RPE sharpens the jumps: an easy
  top-of-range session earns a double increment.
- **Mesocycle periodization** — opt into a training block (Setup → Training block)
  and the engine stops living session-to-session: accumulation weeks ramp your
  prescribed set count while the final week auto-schedules a planned deload
  (reduced load, a set trimmed) so fatigue clears before the next block. The
  Train screen shows the current week and phase, and the block rolls into a fresh
  cycle automatically.
- **Build your own split** — the five built-in days are a starting point, not a
  cage. Setup → Program lets you create custom days (upper/lower, full-body, a
  bro split — whatever you run); they appear on Train with the same rotation,
  progression engine, warm-ups, and stats as the built-ins.
- **Weekly plan with rest days** — set how many sessions a week you train (Setup →
  Weekly plan) and the Train screen lays out a Mon–Sun plan, spacing the day
  templates across training days and marking the rest days between them. Today is
  highlighted and each planned session is one tap from starting.
- **Supersets** — link two exercises in the workout preview and the session
  alternates between them: a superset badge on each, and the rest timer offers a
  one-tap jump to the paired lift instead of waiting out the clock.
- **Goals with projections** — set an estimated-1RM target for any lift (Progress
  → Goals) and Forge fits your e1RM trend to project *when* you'll hit it, flags
  whether you're on pace against an optional deadline, and celebrates the goal
  when the number lands.
- **Time-to-train reminders** — opt into a daily nudge (Setup → Reminders) and,
  if you haven't trained by your chosen hour, Forge notifies you with the exact
  day the coach would pick next.
- **Smart in-workout tools** — warm-up ramps for compounds, per-side plate math,
  auto-starting rest timer with chime/vibration, per-set RPE and notes. The
  timer holds a screen wake lock so the phone won't sleep mid-set, and (opt-in
  in Setup) fires a notification when rest is up even if the app is backgrounded
  or the screen is off.
- **Stall detection** — three sessions without progress on a lift triggers a
  deload-and-rebuild suggestion (or swap to a sibling variation).
- **Muscle freshness + a coach** — the home screen shows days-since-trained per
  muscle *and* recommends what to train next, picking the day whose muscles are
  most rested and flagging anything gone overdue.
- **Editable log** — a Log tab browses every session you've finished; open one to
  fix a mistyped set, delete a set, or remove the whole session. In-workout, any
  logged set can be tapped to edit or swiped away — so a fat-fingered entry never
  permanently skews your PRs, e1RM trends, or next suggestion.
- **Progress** — estimated 1RM trends (Epley), weekly tonnage per muscle group,
  consistency, and PR tracking with in-session PR celebrations.
- **Weekly volume targets** — Progress shows hard sets per muscle for the last 7
  days against each muscle's effective range (MEV–MRV landmarks), colour-coded
  below/in/over range, and the home-screen coach flags muscles you've trained
  but under-dosed this week.
- **Bodyweight tracking** — log your bodyweight (Progress) to see the trend and,
  crucially, to get *accurate* numbers for bodyweight lifts: pull-ups, dips, and
  other bodyweight-loaded moves fold bodyweight-at-the-time into their e1RM, PRs,
  and tonnage instead of counting only the added plate.
- **Stretch tab** — key holds per muscle group, plus a *Desk Rescue* section for
  lower back, tech neck, and hips.
- **Condition tab** — kettlebell, plyometric, and core/spinal-health movements,
  loggable so frequency is tracked.
- **Your data, yours** — everything lives on-device (IndexedDB); one-tap JSON
  export/import in Settings carries sessions, settings, custom exercises, and
  bodyweight. (Custom exercises and the bodyweight log are device-local and
  travel via export/import; sessions and settings also get zero-setup cloud
  backup below.)
- **Zero-setup cloud backup** — sessions also sync to a Supabase table
  automatically, with no sign-in. Every device that opens the app shares one
  data bucket, so a lost or replaced phone gets its full history back the moment
  it opens the app. Sync reconciles by write time, so edits and deletions
  propagate too (not just new sessions), and any backup failure is surfaced in
  Settings instead of failing silently. See "Cloud backup" below.

## Stack

Vite + React + TypeScript, Dexie (IndexedDB), hand-rolled SVG charts,
vite-plugin-pwa. No backend, no accounts.

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # engine unit tests (vitest)
npm run build    # production build to dist/
```

## Deploy / install on your phone

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable Pages → "GitHub Actions" in repo settings). Open the published URL on
your phone and "Add to Home Screen" — it runs full-screen and fully offline.

## Cloud backup

Backup is on by default and needs no sign-in. The app shares one data bucket
keyed by a constant (`OWNER` in `src/db/sync.ts`) and syncs every session to
Supabase under it, so any device that opens the app both backs up and restores
automatically. Sync runs on app open and after each logged session or settings
change, and fails silently when offline (the next sync reconciles). Settings
also has a manual **Sync now** button.

One-time setup (already done for the bundled project): create a Supabase
project, drop its URL + anon key into `src/db/supabaseClient.ts`, and run
`supabase-schema.sql` once in the SQL Editor. That's the whole backend.

**Privacy trade-off:** by default every install shares one public bucket keyed
by a constant, and the anon key ships in the app's public code, so anyone who
found the app's URL and inspected it could read or overwrite the data. For a
personal training log on an obscure URL that's an accepted trade for
zero-friction, no-login backup.

**Private sync key (opt-in hardening):** Setup → Cloud Backup lets you set a
passphrase. When set, your backup is scoped to a bucket derived from
`forge-<sha256(passphrase)>` — the key is held only in the device's
`localStorage` and never ships in the bundle, so reaching your rows now requires
the passphrase, not just the URL. Use the same passphrase on every device to
share history; changing it re-syncs your local data up under the new bucket. The
passphrase is device-local (it travels via neither cloud sync nor JSON
export/import), so set it once per device.
