# Forge — personal gym helper

A minimalist, offline-first PWA for optimizing gains: log your sets, and Forge
tells you exactly what to lift next.

## What it does

- **Set up in four taps** — a first run asks for bodyweight, your bar and plates,
  and how often you train, so pull-up stats, plate math and the weekly plan are
  accurate from session one instead of sitting on defaults until you find Setup.
  Skippable, and everything is editable later.

- **Five gym days** — Push, Pull, Legs, Shoulders & Arms, Chest & Back — each
  with a curated pool of 2–3 exercises per muscle group. Variations rotate
  automatically between sessions for a varied growth stimulus, and any pick can
  be swapped for a like exercise, added, or dropped before you start.
- **Custom exercises** — add the machines and variations your gym actually has
  (Setup → Program → Your exercises). Custom lifts are first-class: they show up as swap and
  add options and get the same progression engine, warm-ups, e1RM trend, and PR
  tracking as the built-ins.
- **Exercises you never do** — a cranky lower back and deadlifts, a shoulder
  that hates overhead pressing, or plain dislike: some lifts are simply not on
  the menu. Swapping one away every session was the app's only answer, and the
  rotation cheerfully offered it back next time. Setup → Program → Never prescribe makes
  that decision once — the lift drops out of the day rotation, the swap
  suggestions and the add lists, on every gym and every device. A slot whose
  whole pool you've excluded is refilled from the same muscle rather than
  vanishing, so the day never comes up a lift short. Nothing already logged is
  touched, and searching a picker for an excluded lift by name still surfaces
  it, dimmed, for the session you change your mind.
- **Progressive overload engine (double progression)** — each exercise has a rep
  range; you add reps at a fixed weight until every set tops the range, then the
  app bumps the weight and you rebuild. RPE sharpens the jumps and is read across
  your last few sessions rather than one: an easy top-of-range run earns a double
  increment, a grind earns half of one, and untagged sessions get the plain
  conservative increment. Every set logged in a workout carries an RPE — it's
  required, with the scale spelled out in reps-left-in-the-tank under the picker
  — so the read is never half a picture.
- **Mesocycle periodization** — opt into a training block (Setup → Progression → Training block)
  and the engine stops living session-to-session: accumulation weeks ramp your
  prescribed set count while the final week auto-schedules a planned deload
  (reduced load, a set trimmed) so fatigue clears before the next block. The
  Train screen shows the current week and phase, and the block rolls into a fresh
  cycle automatically.
- **Build your own split** — the five built-in days are a starting point, not a
  cage. Setup → Program → Your days lets you create custom days (upper/lower, full-body, a
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
- **Finish isn't final until tomorrow** — Finish sits one thumb-width from
  everything else you tap mid-session, and hitting it early used to cost you the
  rest of the workout. Today's session stays re-openable: **Continue** on the
  summary screen, or from a card at the top of Train for the rest of the day.
  Continuing reopens the *same* record — same start time, sets restored, engine
  reading the history as it stood when you began — so an interrupted workout
  stays one workout rather than two short ones an hour apart, the second of them
  prescribing progression on top of the first.
- **A session in progress is already saved** — the workout you're in the middle
  of used to exist in one place only: a blob of JSON in the browser's local
  storage, written to the log and the cloud when you tapped Finish and not a
  moment before. A flat battery, a browser clearing site data, a phone left in a
  locker — any of them took the whole session with it, and the backup had never
  seen a set of it. Every set now writes the session as an *unfinished* row: on
  disk, backed up like everything else, and invisible to the engine until it's
  actually finished, so nothing you're halfway through logging can be read as
  history. If a session ends without you, it's waiting at the top of Train
  under **In progress** — on that phone or any other holding your key — and
  Continue picks it up at the station you were standing at, same record, same
  start time.
- **Readiness check** (opt in, Setup → Progression → Autoregulation) — the log can't see that
  you slept four hours. Rate how you feel before a session and the day's
  prescription bends to match: a rough day trims a set and backs the load off
  10%, a good one earns an extra set. It multiplies with the mesocycle phase, and
  stays deliberately conservative.
- **Goals with projections** — set an estimated-1RM target for any lift (Progress
  → Goals) and Forge fits your e1RM trend to project *when* you'll hit it, flags
  whether you're on pace against an optional deadline, and celebrates the goal
  when the number lands.
- **Time-to-train reminders** — opt into a daily nudge (Setup → Alerts → Daily reminder) and,
  if you haven't trained by your chosen hour, Forge notifies you with the exact
  day the coach would pick next.
- **A profile per gym** — bar weight and plates aren't a preference, they describe
  the room you're standing in: they decide every loadable weight the engine will
  ever suggest. Setup → Equipment keeps a named profile per gym (home rack, hotel,
  the good one with the 1.25s) and a one-tap switcher sits on Train, so travelling
  no longer means being prescribed weights you can't load. Sessions record where
  they were trained.
- **See your own history mid-set** — the exercise screen opens the last three
  sessions on that lift in full: every set, the RPE you tagged, and the notes you
  left yourself. When a lift stalls, the suggestion's "swap to a variation" is a
  button, not just advice.
- **Smart in-workout tools** — warm-up ramps for compounds (bench, squat, rows:
  empty bar then percentage rungs, built from the weight you've actually dialled
  in, so a lift you've never done gets one the moment you name a target),
  per-side plate math, auto-starting rest timer with chime/vibration, per-set RPE
  and notes. The
  rest belongs to the session rather than one station, so it keeps counting
  while you walk to the next lift or add an exercise — naming where it came
  from once you've moved on. The timer holds a screen wake lock so the phone
  won't sleep mid-set, and (opt-in in Setup → Alerts) fires a notification when rest is
  up even if the app is backgrounded or the screen is off.
- **Brick breaker in the rest timer** — rest is dead time you're not allowed to
  skip, so the timer offers a game instead of a scroll: five levels of brick
  breaker in a modal, the ball speeding up and the paddle narrowing as you
  clear them. The clock sits in its header and the whole thing closes itself
  the moment rest is up, so the game can never be the reason you missed a set.
- **Dumbbells say which weight they mean** — "24 kg" on a dumbbell lift is
  ambiguous until you know whether that's one bell or the pair, and a history
  where the answer quietly drifted is worth less than no history. Forge names
  the convention wherever a dumbbell weight is shown or typed — *per hand* for
  anything you hold one in each hand, *one dumbbell* for one-arm work and
  two-hands-under-one-bell lifts. It rides on the target, the warm-up ramp, the
  weight stepper, both log sheets, the PR table and the e1RM chart, and custom
  hand-held lifts declare their own (Setup → Program → Your exercises). Nothing is doubled
  behind your back: tonnage and e1RM use the number you logged, so old sessions
  stay comparable with new ones.
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
- **A cool-down that runs itself** — finishing a session asks one question while
  you're still standing there: warm down, posture correction, core work, or skip.
  Pick one and it offers five or ten minutes, then builds a block that actually
  fills it — holds for the muscles you just trained, the desk-rescue sequences,
  or bodyweight core work, drawn from the app's own catalogs and ordered by
  whatever you've neglected longest. It then *runs* the block: one movement on
  screen at a time with the clock counting the hold, a chime between them, pause
  and skip where you need them. What you finish is logged the way the Stretch and
  Condition tabs log it, so it feeds staleness, muscle freshness and weekly hard
  sets — and a block cut short to fit the time logs the sets it really ran, not
  the ones the scheme wanted.
- **Stretch tab** — key holds per muscle group, plus a *Desk Rescue* section for
  lower back, tech neck, and hips. Holds are loggable and each group shows when
  you last did it, so neglect is visible; the coach names groups gone stale for
  muscles you're actually training, and finishing a session offers the holds for
  what you just trained — warm, done, phone already in hand. Mobility is tracked
  for staleness only: a stretch is not a hard set and never counts as volume,
  tonnage, or a training session.
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

## Setup, organised

Setup is an index, not a page. It used to be eleven ruled sections down one
scroll, which meant "Wipe everything" sat a thumb-width from "Rest timer sound"
and the thing you came for was never twice in the same place. Each concern now
gets a page of its own, and the index states what each one is currently set to —
so most visits end without opening anything.

| Page | What's on it |
| --- | --- |
| **Weekly plan** | Sessions per week, and the seven-day editor for a custom week |
| **Progression** | The training block (mesocycle) and the readiness check |
| **Program** | Your custom days, your custom exercises, and the never-prescribe list |
| **Equipment** | Bar, plates, and a named profile per gym |
| **Alerts** | Rest-timer chime, background rest alerts, the daily time-to-train nudge |
| **Backup & data** | What's on this device, cloud sync and its key, export/restore, and the wipe |

Backup earns its own page because everything on it is about the copy of your
training that outlives this phone — and because the last row on it deletes the
lot, which is not a thing to leave sitting between two toggles.

## Stack

Vite + React + TypeScript, Dexie (IndexedDB), hand-rolled SVG charts,
vite-plugin-pwa. No backend, no accounts.

The bundle is split so the Train screen paints first: React and Dexie sit in
their own long-lived chunks, each tab loads on demand, and the Supabase client
is fetched only when sync actually runs — it's a background job, and it used to
sit in front of the first render.

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # both suites (vitest)
npm run lint     # eslint
npm run build    # production build to dist/
```

`npm test` runs two projects. **engine** (`*.test.ts`, node) covers the pure
functions — progression, scheduling, cool-downs, sync planning. **ui**
(`*.test.tsx`, jsdom + Testing Library) covers the screens, which for a long
time had no tests at all: the session loop, where the data you can't re-derive
is being held, and the shell that persists it. Both run in CI, along with the
lint, before anything deploys.

The lint config is deliberately short. It isn't a style guide — the code has
one — it's there for what the type checker can't see: a hook reading a value it
doesn't list, a promise dropped in a click handler.

## Deploy / install on your phone

`.github/workflows/deploy.yml` runs the lint, both test projects and a
production build on every pull request; pushing to `main` runs the same checks
and then deploys to GitHub Pages (enable Pages → "GitHub Actions" in repo
settings). Open the published URL on your phone and "Add to Home Screen" — it
runs full-screen and fully offline.

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

**And the server is what enforces that**, which it previously wasn't. The table
policies used to be `using (true)`: every request the app makes names its own
bucket, but nothing required one to. Since the project URL and the anon key both
ship in the published bundle, anyone who opened the app could ask PostgREST for
`sessions` with no filter at all and get every bucket back — the unguessable
name protected nothing, because the answer included the list of names. One
unfiltered `delete` could have taken out the lot, too. Each request now has to
name its bucket in an `x-forge-owner` header, and the row-level policies match
`owner` against it: name none and you see nothing, name one and you see exactly
that one. The header carries the already-hashed bucket — the same value the
query string carried before — so nothing new leaves the device.

If you are running your own copy, re-run `supabase-schema.sql` to pick this up;
it replaces the old policies in place and touches no rows. Devices still running
an older bundle stop syncing until the service worker updates them, and lose
nothing while they wait — they keep their full local copy and reconcile on the
next successful sync.

To train across devices, open Setup → Backup & data on the device that has your
history, reveal and copy the key, and enter it on the other device. Keep a copy
somewhere safe: lose it and the device you're holding still has your data, but no
*new* device can reach the backup.

**Installs that predate this** stay on the old shared bucket (`forge-owner`)
rather than being silently re-keyed away from their own history. That bucket's
name ships in the app's public code, so anyone who found the URL could read or
overwrite it — Setup → Backup & data offers a one-tap switch to a private bucket,
which re-uploads your local data under the new key. You can switch back, with a
warning about what you're giving up.
