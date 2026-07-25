import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BodyLog, DayId, Goal, ReadinessLevel, Session, SetLog, Settings } from './types'
import {
  DEFAULT_SETTINGS, getBodyLog, getGoals, getHistory, getSettings, loadCustomDays, loadCustomExercises, saveGoal,
} from './db/db'
import { initSyncMode, onSyncError, pushRecord, runSync, supabaseConfigured } from './db/sync'
import { reminderNudge } from './engine/reminder'
import { newlyAchieved } from './engine/goals'
import { bodyweightAt } from './engine/bodyweight'
import { applyActiveProfile } from './engine/equipment'
import { notifyTrainingReminder } from './notify'
import { BarbellIcon, ChartIcon, GearIcon, HistoryIcon, KettlebellIcon, StretchIcon } from './components/Icons'
import { TodayScreen } from './screens/Today'
import { WorkoutScreen } from './screens/Workout'
import { Onboarding } from './screens/Onboarding'

// Everything but Train and the workout itself loads on demand. Train is what
// opens when you unlock your phone in the gym; Progress (charts) and Setup
// (forms, program builder) have no business delaying that first paint.
const LogScreen = lazy(() => import('./screens/Log').then((m) => ({ default: m.LogScreen })))
const StretchScreen = lazy(() => import('./screens/Stretch').then((m) => ({ default: m.StretchScreen })))
const ConditioningScreen = lazy(() => import('./screens/Conditioning').then((m) => ({ default: m.ConditioningScreen })))
const ProgressScreen = lazy(() => import('./screens/Progress').then((m) => ({ default: m.ProgressScreen })))
const SettingsScreen = lazy(() => import('./screens/Settings').then((m) => ({ default: m.SettingsScreen })))

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
}

const ACTIVE_KEY = 'forge-active-workout'
const REMINDER_KEY = 'forge-reminder-shown' // start-of-day epoch of the last nudge

function loadActive(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null
  } catch {
    return null
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [stretchFocus, setStretchFocus] = useState<string[]>([])
  const [history, setHistory] = useState<Session[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [bodyLog, setBodyLog] = useState<BodyLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [active, setActiveState] = useState<ActiveWorkout | null>(loadActive)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const refreshRef = useRef<() => Promise<void>>(async () => {})

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
    refresh()
      .then(async () => {
        // Settle which cloud bucket this device uses before the first sync: a
        // brand-new install gets a random private key, an install that already
        // has history stays on the shared bucket until it opts in.
        initSyncMode((await getHistory()).length > 0)
        setReady(true)
      })
      .then(() => syncNow())
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
      if (Number(localStorage.getItem(REMINDER_KEY)) === today) return
      localStorage.setItem(REMINDER_KEY, String(today))
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

  const setActive = useCallback((w: ActiveWorkout | null) => {
    setActiveState(w)
    if (w) localStorage.setItem(ACTIVE_KEY, JSON.stringify(w))
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

  if (!ready) return null

  // A fresh install runs on defaults, with bodyweight unset and the plate list
  // guessed — which quietly switches off pull-up/dip accuracy and can prescribe
  // weights the gym can't load. Ask four questions instead.
  if (settings.onboardedAt === undefined && history.length === 0) {
    return <Onboarding onDone={refresh} />
  }

  const inWorkout = active !== null && tab === 'today'

  return (
    <div className="app">
      <main className="app-main">
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
                startWorkout={setActive} onChanged={refresh} />
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
    </div>
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
