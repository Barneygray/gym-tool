# Forge — personal gym helper

A minimalist, offline-first PWA for optimizing gains: log your sets, and Forge
tells you exactly what to lift next.

## What it does

- **Five gym days** — Push, Pull, Legs, Shoulders & Arms, Chest & Back — each
  with a curated pool of 2–3 exercises per muscle group. Variations rotate
  automatically between sessions for a varied growth stimulus, and any pick can
  be swapped for a like exercise.
- **Progressive overload engine (double progression)** — each exercise has a rep
  range; you add reps at a fixed weight until every set tops the range, then the
  app bumps the weight and you rebuild. Logging RPE sharpens the jumps: an easy
  top-of-range session earns a double increment.
- **Smart in-workout tools** — warm-up ramps for compounds, per-side plate math,
  auto-starting rest timer with chime/vibration, per-set RPE and notes.
- **Stall detection** — three sessions without progress on a lift triggers a
  deload-and-rebuild suggestion (or swap to a sibling variation).
- **Muscle freshness** — the home screen shows days-since-trained per muscle so
  you can pick today's session intelligently.
- **Progress** — estimated 1RM trends (Epley), weekly tonnage per muscle group,
  consistency, and PR tracking with in-session PR celebrations.
- **Stretch tab** — key holds per muscle group, plus a *Desk Rescue* section for
  lower back, tech neck, and hips.
- **Condition tab** — kettlebell, plyometric, and core/spinal-health movements,
  loggable so frequency is tracked.
- **Your data, yours** — everything lives on-device (IndexedDB); one-tap JSON
  export/import in Settings.

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
