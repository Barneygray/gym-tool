import { useEffect, useState } from 'react'
import type { Settings } from '../../types'
import { getCustomDays, getCustomExercises, saveSettings } from '../../db/db'
import { getSyncKey, pushSettings, supabaseConfigured } from '../../db/sync'
import { phaseFor } from '../../engine/mesocycle'
import { activeProfile, profilesOf } from '../../engine/equipment'
import { clampFrequency, defaultSplit, shortDayLabel } from '../../engine/schedule'
import { ChevronIcon } from '../../components/Icons'
import { AlertsPage, fmtHour } from './AlertsPage'
import { DataPage } from './DataPage'
import { EquipmentPage } from './EquipmentPage'
import { ProgramPage } from './ProgramPage'
import { ProgressionPage } from './ProgressionPage'
import { SchedulePage } from './SchedulePage'
import type { UpdateSettings } from './shared'

type Page = 'schedule' | 'progression' | 'program' | 'equipment' | 'alerts' | 'data'

interface SettingsProps {
  settings: Settings
  onChanged: () => Promise<void>
  syncing: boolean
  onSyncNow: () => Promise<void>
  syncError: string | null
}

/**
 * Setup is an index, not a page. Eleven sections in one column meant the thing
 * you came for was always a scroll away and never twice in the same place, so
 * each concern now gets a page of its own and this screen's whole job is to say
 * where they are and what state they're in.
 */
export function SettingsScreen({ settings, onChanged, syncing, onSyncNow, syncError }: SettingsProps) {
  const [page, setPage] = useState<Page | null>(null)

  const update: UpdateSettings = async (patch) => {
    const next = { ...settings, ...patch }
    await saveSettings(next)
    void pushSettings(next)
    await onChanged()
  }

  const back = () => setPage(null)

  switch (page) {
    case 'schedule':
      return <SchedulePage settings={settings} update={update} onBack={back} />
    case 'progression':
      return <ProgressionPage settings={settings} update={update} onBack={back} />
    case 'program':
      return <ProgramPage settings={settings} update={update} onChanged={onChanged} onBack={back} />
    case 'equipment':
      return <EquipmentPage settings={settings} update={update} onBack={back} />
    case 'alerts':
      return <AlertsPage settings={settings} update={update} onBack={back} />
    case 'data':
      return (
        <DataPage onChanged={onChanged} onBack={back}
          syncing={syncing} onSyncNow={onSyncNow} syncError={syncError} />
      )
    default:
      return <SetupIndex settings={settings} open={setPage} syncing={syncing} syncError={syncError} />
  }
}

function SetupIndex({ settings, open, syncing, syncError }: {
  settings: Settings
  open: (p: Page) => void
  syncing: boolean
  syncError: string | null
}) {
  const counts = useProgramCounts()

  const freq = clampFrequency(settings.weeklyFrequency ?? 4)
  const profiles = profilesOf(settings)
  const gym = activeProfile(settings)
  const phase = phaseFor(settings.meso, Date.now())
  const excluded = settings.excluded?.length ?? 0

  const scheduleState = settings.weekPlan
    ? `Custom week · ${settings.weekPlan.filter(Boolean).length} training days`
    : `${freq}× a week · ${defaultSplit(freq).map(shortDayLabel).join(' · ')}`

  const progressionState = [
    phase ? phase.label : 'No block running',
    settings.readinessCheck ? 'readiness check on' : 'readiness check off',
  ].join(' · ')

  const programState = counts === null ? 'Loading…'
    : counts.days + counts.exercises + excluded === 0 ? 'All built-in — nothing customised yet'
    : [
        counts.days > 0 && `${counts.days} custom day${counts.days === 1 ? '' : 's'}`,
        counts.exercises > 0 && `${counts.exercises} custom exercise${counts.exercises === 1 ? '' : 's'}`,
        excluded > 0 && `${excluded} never prescribed`,
      ].filter(Boolean).join(' · ')

  const equipmentState = profiles.length > 1
    ? `${gym.name} · ${gym.barWeightKg} kg bar · ${profiles.length} gyms saved`
    : `${gym.barWeightKg} kg bar · ${gym.platesKg.join(', ')} kg plates`

  const alertsState = [
    settings.soundOn ? 'Rest chime on' : 'Rest chime off',
    settings.reminder ? `daily nudge at ${fmtHour(settings.reminder.hour)}` : 'no daily nudge',
  ].join(' · ')

  const dataState = !supabaseConfigured
    ? 'Export and restore a backup file'
    : syncError ? 'Cloud backup needs attention'
    : syncing ? 'Syncing…'
    : getSyncKey() ? 'Cloud backup on · private key' : 'Cloud backup on · shared bucket'

  return (
    <>
      <div className="screen-head">
        <h1 className="screen-title">Setup</h1>
      </div>

      <div className="section-label">Training</div>
      <nav className="setup-index">
        <IndexRow title="Weekly plan" state={scheduleState} onOpen={() => open('schedule')} />
        <IndexRow title="Progression" state={progressionState} onOpen={() => open('progression')} />
        <IndexRow title="Program" state={programState} onOpen={() => open('program')} />
      </nav>

      <div className="section-label">Your gym</div>
      <nav className="setup-index">
        <IndexRow title="Equipment" state={equipmentState} onOpen={() => open('equipment')} />
      </nav>

      <div className="section-label">App</div>
      <nav className="setup-index">
        <IndexRow title="Alerts" state={alertsState} onOpen={() => open('alerts')} />
        <IndexRow title="Backup & data" state={dataState} onOpen={() => open('data')} />
      </nav>
    </>
  )
}

/**
 * One line per page: what it's called, and what it's currently set to. The
 * state line is the point — it turns the index into a summary of the whole
 * setup, so most visits end without opening anything.
 */
function IndexRow({ title, state, onOpen }: {
  title: string
  state: string
  onOpen: () => void
}) {
  return (
    <button className="setup-row" onClick={onOpen}>
      <span className="sr-text">
        <span className="k">{title}</span>
        <span className="sub">{state}</span>
      </span>
      <span className="sr-chevron" aria-hidden="true"><ChevronIcon size={16} /></span>
    </button>
  )
}

/** Custom days and exercises live in Dexie, so the index has to go and ask. */
function useProgramCounts() {
  const [counts, setCounts] = useState<{ days: number; exercises: number } | null>(null)
  useEffect(() => {
    void Promise.all([getCustomDays(), getCustomExercises()])
      .then(([days, exercises]) => setCounts({ days: days.length, exercises: exercises.length }))
  }, [])
  return counts
}
