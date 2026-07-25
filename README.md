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
  app bumps the weight and you rebuild. RPE sharpens the jumps and is read across
  your last few sessions rather than one: an easy top-of-range run earns a double
  increment, a grind earns half of one, and untagged sessions get the plain
  conservative increment.
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
  highlighted and each planned session is one tap from starting. Or build the
  week by hand: every weekday gets a dropdown over *all* your day templates,
  custom ones included, so a bespoke program actually drives the plan instead of
  being crowded out by the built-in split.
- **Supersets** — link two exercises in the workout preview and the session
  alternates between them: a superset badge on each, and the rest timer offers a
  one-tap jump to the paired lift instead of waiting out the clock.
- **The session bends to the gym** — the plan you walked in with rarely survives a
  busy Monday. Mid-workout you can add a station, swap the current one for a
  like-for-like alternative, or skip it outright; anything you've already logged
  sets against is protected from a swap or skip so the work can't be stranded.
  And when there's no plan at all, **Freestyle** starts an empty session you build
  as you go — the same progression engine, warm-ups, PRs, and stats apply.
- **Readiness check** (opt in, Setup → Autoregulation) — the log can't see that
  you slept four hours. Rate how you feel before a session and the day's
  prescription bends to match: a rough day trims a set and backs the load off
  10%, a good one earns an extra set. It multiplies with the mesocycle phase, and
  stays deliberately conservative.
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
  deload-and-rebuild suggestion (or swap to a sibling variation). Progress is
  judged on *effective* load, so holding your pull-up reps through a bodyweight
  gain reads as the progress it is, instead of being mistaken for a stall.
- **Muscle freshness + a coach** — the home screen shows days-since-trained per
  muscle *and* recommends what to train next. When your week has a session
  scheduled for today, the coach leads with it rather than second-guessing your
  own plan — but it still checks the plan against recovery and says so plainly
  when the two disagree ("Push is planned, but chest rested 0d — Pull is fresher
  if you'd rather swap"). Off-plan, it picks the freshest day, leaning toward
  whatever the week is still short of.
- **Editable log** — a Log tab browses every session you've finished; open one to
  fix a mistyped set, delete a set, or remove the whole session. In-workout, any
  logged set can be tapped to edit or swiped away — so a fat-fingered entry never
  permanently skews your PRs, e1RM trends, or next suggestion. Trained without
  your phone? **Add a past session** backfills it against any date, so gaps in
  the history stop quietly distorting stall detection, muscle freshness, and
  consistency.
- **Progress** — estimated 1RM trends (Epley), weekly tonnage per muscle group,
  consistency, and PR tracking with in-session PR celebrations. PRs are kept per
  rep band — heavy (1–5), moderate (6–12), high rep (13+) — because a heavy
  triple and a set of fifteen aren't the same achievement and shouldn't compete.
  Estimated 1RM only settles records and stall calls inside the rep range where
  the formula holds up (~12), so a light high-rep back-off set can't fake a PR
  or mask a genuine plateau.
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
- **Usable with a screen reader** — the custom switches, segmented pickers, RPE
  row, weekday strip and steppers carry proper `switch`/`radio`/`checkbox`
  semantics and accessible names, so their state is announced rather than being
  conveyed by colour alone.
- **Condition tab** — kettlebell, plyometric, and core/spinal-health movements,
  loggable so frequency is tracked. Conditioning is not a separate silo: each
  move maps to the muscles it works, so a swing session counts toward glute and
  hamstring freshness and weekly hard sets like any other work. It logs the
  scheme's real set count, and never invents tonnage — a plank is a marker, not
  a rep at bodyweight.
- **Your data, yours** — everything lives on-device (IndexedDB); one-tap JSON
  export/import in Settings carries the lot. A restore tells you exactly what the
  file holds and what it will replace *before* it runs, refuses anything
  malformed without touching a table, and keeps a snapshot so **Undo last
  restore** puts things back if it was the wrong file.
- **Zero-setup cloud backup** — everything syncs to Supabase automatically, with
  no sign-in: sessions, settings, custom exercises, custom days, goals, and the
  bodyweight log. A lost or replaced phone gets the whole picture back, not just
  sessions whose custom exercises have gone missing. Sync reconciles by write
  time, so edits and deletions propagate too, and any backup failure is surfaced
  in Settings instead of failing silently. See "Cloud backup" below.

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

Backup is on by default and needs no sign-in. Every record — sessions, settings,
custom exercises, custom days, goals, bodyweight — syncs to Supabase under an
`owner` bucket, so any device holding your key both backs up and restores
automatically. Sync runs on app open and after each change, and fails silently
when offline (the next sync reconciles). Settings also has a manual **Sync now**
button.

One-time setup (already done for the bundled project): create a Supabase
project, drop its URL + anon key into `src/db/supabaseClient.ts`, and run
`supabase-schema.sql` once in the SQL Editor. That's the whole backend. The
script is idempotent and non-destructive, so it's safe to re-run against a
project that already holds history.

**Your bucket is private by default.** A fresh install generates a random key on
first run and syncs to a bucket named `forge-<sha256(key)>` — a value that never
ships in the bundle and that the server never sees in plaintext. Reaching your
data needs the key, not just the app's URL.

To train across devices, open Setup → Cloud Backup on the device that has your
history, reveal and copy the key, and enter it on the other device. Keep a copy
somewhere safe: lose it and the device you're holding still has your data, but no
*new* device can reach the backup.

**Installs that predate this** stay on the old shared bucket (`forge-owner`)
rather than being silently re-keyed away from their own history. That bucket's
name ships in the app's public code, so anyone who found the URL could read or
overwrite it — Setup → Cloud Backup offers a one-tap switch to a private bucket,
which re-uploads your local data under the new key. You can switch back, with a
warning about what you're giving up.
