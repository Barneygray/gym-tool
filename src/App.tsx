import { useCallback, useEffect, useRef, useState } from 'react'
import type { DayType, Session, SetLog, Settings } from './types'
import { DEFAULT_SETTINGS, getHistory, getSettings } from './db/db'
import { runSync } from './db/sync'
import { BarbellIcon, ChartIcon, GearIcon, KettlebellIcon, StretchIcon } from './components/Icons'
import { TodayScreen } from './screens/Today'
import { WorkoutScreen } from './screens/Workout'
import { StretchScreen } from './screens/Stretch'
import { ConditioningScreen } from './screens/Conditioning'
import { ProgressScreen } from './screens/Progress'
import { SettingsScreen } from './screens/Settings'

export type Tab = 'today' | 'stretch' | 'condition' | 'progress' | 'settings'

export interface ActiveWorkout {
  dayType: DayType
  startedAt: number
  exerciseIds: string[]
  logged: Record<string, SetLog[]>
  currentIndex: number
}

const ACTIVE_KEY = 'forge-active-workout'

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
  const [active, setActiveState] = useState<ActiveWorkout | null>(loadActive)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    const [h, s] = await Promise.all([getHistory(), getSettings()])
    setHistory(h)
    setSettings(s)
  }, [])
  refreshRef.current = refresh

  useEffect(() => {
    refresh().then(() => setReady(true))
  }, [refresh])

  useEffect(() => {
    setSyncing(true)
    runSync()
      .then(() => refreshRef.current())
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [])

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
            onFinished={refresh}
          />
        ) : (
          <>
            {tab === 'today' && (
              <TodayScreen history={history} settings={settings} startWorkout={setActive} />
            )}
            {tab === 'stretch' && <StretchScreen />}
            {tab === 'condition' && <ConditioningScreen history={history} onLogged={refresh} />}
            {tab === 'progress' && <ProgressScreen history={history} />}
            {tab === 'settings' && (
              <SettingsScreen settings={settings} onChanged={refresh} syncing={syncing} />
            )}
          </>
        )}
      </main>

      {!inWorkout && (
        <nav className="tabbar">
          <TabButton id="today" label="Train" current={tab} onSelect={setTab}><BarbellIcon /></TabButton>
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
