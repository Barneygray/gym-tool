import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BodyLog, DayId, Goal, ReadinessLevel, Session, SetLog, Settings } from './types'
import {
  DEFAULT_SETTINGS, discardDraftSession, getBodyLog, getDraftSession, getGoals, getHistory, getSessionByUuid,
  getSettings, loadCustomDays, loadCustomExercises, saveGoal, saveLiveSession,
} from './db/db'
import { initSyncMode, onSyncError, pushRecord, pushSession, runSync, supabaseConfigured } from './db/sync'
import { reminderNudge } from './engine/reminder'
import { newlyAchieved } from './engine/goals'
import { bodyweightAt } from './engine/bodyweight'
import { applyActiveProfile, activeProfile } from './engine/equipment'
import { draftSession } from './engine/resume'
import { notifyTrainingReminder } from './notify'
import { BarbellIcon, ChartIcon, GearIcon, HistoryIcon, KettlebellIcon, StretchIcon } from './components/Icons'
import { ErrorBoundary } from './components/ErrorBoundary'
import { lazyScreen } from './components/lazyScreen'
import { OverlayHostContext } from './components/Overlay'
import { useShellHeight } from './hooks/useShellHeight'
import { TodayScreen } from './screens/Today'
import { WorkoutScreen } from './screens/Workout'
import { Onboarding } from './screens/Onboarding'

// Everything but Train and the workout itself loads on demand. Train is what
// opens when you unlock your phone in the gym; Progress (charts) and Setup
// (forms, program builder) have no business delaying that first paint.
const LogScreen = lazyScreen(() => import('./screens/Log').then((m) => ({ default: m.LogScreen })))
const StretchScreen = lazyScreen(() => import('./screens/Stretch').then((m) => ({ default: m.StretchScreen })))
const ConditioningScreen = lazyScreen(() => import('./screens/Conditioning').then((m) => ({ default: m.ConditioningScreen })))
const ProgressScreen = lazyScreen(() => import('./screens/Progress').then((m) => ({ default: m.ProgressScreen })))
const SettingsScreen = lazyScreen(() => import('./screens/settings').then((m) => ({ default: m.SettingsScreen })))

export type Tab = 'today' | 'log' | 'stretch' | 'condition' | 'progress' | 'settings'

export interface ActiveWorkout {
  dayType: DayId
  startedAt: number
  exerciseIds: string[]
  logged: Record<string, SetLog[]>
  currentIndex: number
  /** Exercise-id groups trained as supersets (each group has 2+ ids). */
  supersets?: string[][]
  /** Pre-session self-rating, when the readiness check is on. */
  readiness?: ReadinessLevel | null
  /**
   * Set when this is a finished session reopened to carry on with. Finishing
   * again rewrites that record rather than filing a second one, so a workout
   * interrupted by a mis-tapped Finish stays one workout.
   */
  sessionUuid?: string
}

const ACTIVE_KEY = 'forge-active-workout'
const REMINDER_KEY = 'forge-reminder-shown' // start-of-day epoch of the last nudge

/**
 * How long the cloud copy of a session in progress may lag behind the local
 * one. Every set, every station change and every swap writes the local row;
 * pushing each of those would be a request a minute all session long, for a
 * record that only matters if this device stops being able to answer for it.
 */
const DRAFT_PUSH_MS = 10_000

/**
 * localStorage, which on a phone is not a thing you may assume works: Safari in
 * private browsing, storage turned off for the site, and a full quota all
 * *throw* from `setItem` rather than quietly doing nothing.
 *
 * The reads here were always wrapped; the writes weren't — and one of them sits
 * inside the state setter every logged set goes through, so on those devices
 * logging a set threw out of the click handler and took the session screen down
 * with it. Everywhere else in the app that touches storage already guards both
 * halves (see `engine/breakerMemory.ts`); this is that, for the shell.
 */
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      // Nothing to do about it — and for the live session, nothing lost either:
      // the IndexedDB draft underneath is the copy that has to survive.
    }
  },
}

function loadActive(): ActiveWorkout | null {
  try {
    const raw = store.get(ACTIVE_KEY)
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null
  } catch {
    return null
  }
}

const writeActive = (w: ActiveWorkout | null): void =>
  store.set(ACTIVE_KEY, w === null ? null : JSON.stringify(w))

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [stretchFocus, setStretchFocus] = useState<string[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [bodyLog, setBodyLog] = useState<BodyLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [active, setActiveState] = useState<ActiveWorkout | null>(loadActive)
  /** A session left in progress — on this device or another one — to walk back into. */
  const [draft, setDraft] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  // The node sheets and the rest timer portal into. It has to be a child of
  // `.app` for them to measure against the same bottom edge as the tab bar.
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  // Read inside `setActive`, which has to stay identity-stable — every screen
  // takes it as a prop — so the settings it needs come through a ref.
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  /** The uuid of the session currently being logged, if any. */
  const draftUuid = useRef<string | null>(active?.sessionUuid ?? null)
  const draftPush = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keeps the shell exactly as tall as the visible viewport, so the tab bar
  // lands on the bottom edge of the screen and stays there.
  useShellHeight()

  const refresh = useCallback(async () => {
    // Register custom exercises and days before setting state, so any render
    // that looks up one by id (e.g. a resumed workout) resolves it.
    await Promise.all([loadCustomExercises(), loadCustomDays()])
    const [h, s, bl, g] = await Promise.all([getHistory(), getSettings(), getBodyLog(), getGoals()])
    // Stamp any goal whose target was just met so the win is recorded once.
    const hit = newlyAchieved(g, h, bodyweightAt(bl))
    if (hit.length > 0) {
      const now = Date.now()
      const saved = await Promise.all(hit.map((goal) => saveGoal({ ...goal, achievedAt: now })))
      for (const goal of saved) void pushRecord('goal', goal.id, goal)
      for (const goal of hit) goal.achievedAt = now
    }
    setHistory(h)
    setSettings(s)
    setBodyLog(bl)
    setGoals(g)
    setDraft((await getDraftSession()) ?? null)
  }, [])
  refreshRef.current = refresh

  const syncNow = useCallback(async () => {
    if (!supabaseConfigured) return
    setSyncing(true)
    try {
      await runSync()
      await refreshRef.current()
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refresh()
        // Settle which cloud bucket this device uses before the first sync: a
        // brand-new install gets a random private key, an install that already
        // has history stays on the shared bucket until it opts in.
        initSyncMode((await getHistory()).length > 0)
      } catch {
        // Whatever happened, open the app. Nothing renders until `ready`, so a
        // first load that throws — a browser refusing IndexedDB, a corrupt row —
        // used to leave a blank page with no way past it.
      } finally {
        setReady(true)
      }
      try {
        await syncNow()
      } catch {
        // Backup failures surface through `onSyncError`, not by throwing here.
      }
    })()
  }, [refresh, syncNow])

  useEffect(() => onSyncError(setSyncError), [])

  // Fire the daily "time to train" nudge at most once per day, when due. This
  // runs while the app is open (PWAs can't wake themselves reliably), and also
  // re-checks when the tab returns to the foreground.
  useEffect(() => {
    if (!ready) return
    const check = () => {
      const now = Date.now()
      const nudge = reminderNudge(settings.reminder, history, now)
      if (!nudge.due) return
      const today = new Date(now).setHours(0, 0, 0, 0)
      if (Number(store.get(REMINDER_KEY)) === today) return
      store.set(REMINDER_KEY, String(today))
      void notifyTrainingReminder(nudge.title, nudge.body)
    }
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ready, settings.reminder, history])

  // Resolve the active gym's equipment once here, so plate math, warm-up rungs
  // and suggestion rounding all read one obvious pair of fields and need no
  // idea that profiles exist.
  const equipped = useMemo(() => applyActiveProfile(settings), [settings])

  /**
   * Send the stored draft to the cloud. Deliberately re-reads the row instead
   * of pushing what was in hand when the timer was set: by the time it fires
   * the session may have been finished or abandoned, and pushing the older copy
   * would hand the cloud a session that had un-finished itself.
   */
  const flushDraft = useCallback(async (uuid: string) => {
    if (draftPush.current) {
      clearTimeout(draftPush.current)
      draftPush.current = null
    }
    const row = await getSessionByUuid(uuid)
    if (row) void pushSession(row)
  }, [])

  /** Tombstone an unfinished row, so the abandonment reaches other devices. */
  const discard = useCallback((uuid: string) => {
    void discardDraftSession(uuid).then((t) => t && pushSession(t))
  }, [])

  const setActive = useCallback((w: ActiveWorkout | null) => {
    // Every live session is a row, so it needs an identity from the first set —
    // not at Finish, which is exactly the moment it might never reach.
    const next = w === null || w.sessionUuid ? w : { ...w, sessionUuid: crypto.randomUUID() }
    setActiveState(next)
    writeActive(next)

    const previous = draftUuid.current
    draftUuid.current = next?.sessionUuid ?? null
    setDraft(null)

    if (next === null) {
      // Walking away from a session in progress discards it; walking away from
      // one that was *finished* must not — same transition, different row.
      if (previous) discard(previous)
      return
    }

    const session = draftSession(next, activeProfile(settingsRef.current).id)
    if (!session.uuid) return
    // Nothing logged is nothing to recover: no row for a session that hasn't
    // started, and no stale row left behind by one whose sets were all deleted.
    if (session.entries.length === 0) {
      discard(session.uuid)
      return
    }
    void saveLiveSession(session)
    const uuid = session.uuid
    if (draftPush.current) clearTimeout(draftPush.current)
    draftPush.current = setTimeout(() => void flushDraft(uuid), DRAFT_PUSH_MS)
  }, [discard, flushDraft])

  // Back the session up the moment the app is backgrounded or closed, rather
  // than waiting out the debounce — that's precisely when the device is about
  // to stop being able to answer for it.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && draftUuid.current) void flushDraft(draftUuid.current)
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [flushDraft])

  if (!ready) return null

  // A fresh install runs on defaults, with bodyweight unset and the plate list
  // guessed — which quietly switches off pull-up/dip accuracy and can prescribe
  // weights the gym can't load. Ask four questions instead.
  if (settings.onboardedAt === undefined && history.length === 0) {
    return <Onboarding onDone={refresh} />
  }

  const inWorkout = active !== null && tab === 'today'

  return (
    <OverlayHostContext.Provider value={overlayHost}>
      <div className="app">
        {/* A live session hides the tab bar, so `full` takes back the space
            reserved for it — the screen used to end in ~100px of nothing. */}
        <main className={`app-main${inWorkout ? ' full' : ''}`}>
          {/* Keyed on the tab, so switching away from a screen that threw gives
              the next one a clean boundary — a screen that failed to load used
              to take the whole app down to a black page with it. */}
          <ErrorBoundary resetKey={inWorkout ? 'workout' : tab}>
            {inWorkout ? (
              <WorkoutScreen
                active={active}
                setActive={setActive}
                history={history}
                settings={equipped}
                bodyLog={bodyLog}
                onFinished={refresh}
                onStretch={(groups) => {
                  setActive(null)
                  setStretchFocus(groups)
                  setTab('stretch')
                }}
              />
            ) : (
              <>
                {tab === 'today' && (
                  <TodayScreen history={history} settings={equipped} bodyLog={bodyLog}
                    draft={draft} startWorkout={setActive} onChanged={refresh} />
                )}
                <Suspense fallback={<div className="screen-loading">Loading…</div>}>
                  {tab === 'log' && <LogScreen history={history} onChanged={refresh} />}
                  {tab === 'stretch' && (
                    <StretchScreen history={history} onLogged={refresh} focus={stretchFocus} />
                  )}
                  {tab === 'condition' && <ConditioningScreen history={history} onLogged={refresh} />}
                  {tab === 'progress' && (
                    <ProgressScreen history={history} bodyLog={bodyLog} goals={goals} onChanged={refresh} />
                  )}
                  {tab === 'settings' && (
                    <SettingsScreen
                      settings={settings}
                      onChanged={refresh}
                      syncing={syncing}
                      onSyncNow={syncNow}
                      syncError={syncError}
                    />
                  )}
                </Suspense>
              </>
            )}
          </ErrorBoundary>
        </main>

        {!inWorkout && (
          <nav className="tabbar">
            <TabButton id="today" label="Train" current={tab} onSelect={setTab}><BarbellIcon /></TabButton>
            <TabButton id="log" label="Log" current={tab} onSelect={setTab}><HistoryIcon /></TabButton>
            <TabButton id="stretch" label="Stretch" current={tab} onSelect={setTab}><StretchIcon /></TabButton>
            <TabButton id="condition" label="Condition" current={tab} onSelect={setTab}><KettlebellIcon /></TabButton>
            <TabButton id="progress" label="Progress" current={tab} onSelect={setTab}><ChartIcon /></TabButton>
            <TabButton id="settings" label="Setup" current={tab} onSelect={setTab}><GearIcon /></TabButton>
          </nav>
        )}

        {/* Everything that docks to the bottom of the screen renders in here,
            so it measures against `.app` — the box that tracks what's visible —
            instead of against the layout viewport the way `position: fixed`
            would. See `components/Overlay.tsx`. */}
        <div className="app-overlay" ref={setOverlayHost} />
      </div>
    </OverlayHostContext.Provider>
  )
}

function TabButton({ id, label, current, onSelect, children }: {
  id: Tab
  label: string
  current: Tab
  onSelect: (t: Tab) => void
  children: React.ReactNode
}) {
  return (
    <button className={current === id ? 'active' : ''} onClick={() => onSelect(id)}>
      {children}
      <span>{label}</span>
    </button>
  )
}
