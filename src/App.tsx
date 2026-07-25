import { useCallback, useEffect, useRef, useState } from 'react'
import type { BodyLog, DayId, Goal, Session, SetLog, Settings } from './types'
import {
  DEFAULT_SETTINGS, getBodyLog, getGoals, getHistory, getSettings, loadCustomDays, loadCustomExercises, saveGoal,
} from './db/db'
import { onSyncError, runSync, supabaseConfigured } from './db/sync'
import { reminderNudge } from './engine/reminder'
import { newlyAchieved } from './engine/goals'
import { bodyweightAt } from './engine/bodyweight'
import { notifyTrainingReminder } from './notify'
import { BarbellIcon, ChartIcon, GearIcon, HistoryIcon, KettlebellIcon, StretchIcon } from './components/Icons'
import { TodayScreen } from './screens/Today'
import { WorkoutScreen } from './screens/Workout'
import { LogScreen } from './screens/Log'
import { StretchScreen } from './screens/Stretch'
import { ConditioningScreen } from './screens/Conditioning'
import { ProgressScreen } from './screens/Progress'
import { SettingsScreen } from './screens/Settings'

export type Tab = 'today' | 'log' | 'stretch' | 'condition' | 'progress' | 'settings'

export interface ActiveWorkout {
  dayType: DayId
  startedAt: number
  exerciseIds: string[]
  logged: Record<string, SetLog[]>
  currentIndex: number
  /** Exercise-id groups trained as supersets (each group has 2+ ids). */
  supersets?: string[][]
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
      await Promise.all(hit.map((goal) => saveGoal({ ...goal, achievedAt: now })))
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
      .then(() => setReady(true))
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

  const setActive = useCallback((w: ActiveWorkout | null) => {
    setActiveState(w)
    if (w) localStorage.setItem(ACTIVE_KEY, JSON.stringify(w))
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

  if (!ready) return null

  const inWorkout = active !== null && tab === 'today'

  return (
    <div className="app">
      <main className="app-main">
        {inWorkout ? (
          <WorkoutScreen
            active={active}
            setActive={setActive}
            history={history}
            settings={settings}
            bodyLog={bodyLog}
            onFinished={refresh}
          />
        ) : (
          <>
            {tab === 'today' && (
              <TodayScreen history={history} settings={settings} startWorkout={setActive} />
            )}
            {tab === 'log' && <LogScreen history={history} onChanged={refresh} />}
            {tab === 'stretch' && <StretchScreen />}
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
