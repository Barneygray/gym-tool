import { useEffect, useRef, useState } from 'react'
import type { DayId, DaySlot, DayTemplate, Equipment, Exercise, Muscle, Settings, WeekPlan } from '../types'
import {
  deleteCustomDay, deleteCustomExercise, exportData, getCustomDays, getCustomExercises,
  getRestoreSnapshot, importData, parseBackup, saveCustomDay, saveCustomExercise, saveSettings,
  summarizeBackup, summarizeLocal, undoRestore, wipeAll,
} from '../db/db'
import { DAYS } from '../data/days'
import { EXERCISES, makeCustomExercise } from '../data/exercises'
import { makeCustomDay } from '../data/days'
import { phaseFor } from '../engine/mesocycle'
import { autoWeekPlan, clampFrequency, defaultSplit, dayLabel } from '../engine/schedule'
import {
  generateSyncKey, getSyncKey, pushRecord, pushSettings, setSyncKey, supabaseConfigured,
} from '../db/sync'
import { notificationPermission, notificationsSupported, requestNotifications } from '../notify'
import { ExercisePicker } from '../components/ExercisePicker'
import { TrashIcon } from '../components/Icons'

const WEEKDAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const MUSCLES: Muscle[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core',
]
const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}
const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell']
const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine',
  bodyweight: 'Bodyweight', kettlebell: 'Kettlebell',
}

interface SettingsProps {
  settings: Settings
  onChanged: () => Promise<void>
  syncing: boolean
  onSyncNow: () => Promise<void>
  syncError: string | null
}

export function SettingsScreen({ settings, onChanged, syncing, onSyncNow, syncError }: SettingsProps) {
  const [platesText, setPlatesText] = useState(settings.platesKg.join(', '))
  const [status, setStatus] = useState<string | null>(null)
  const [undoable, setUndoable] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // A stashed snapshot survives a reload, so the undo offer should too.
  useEffect(() => {
    void getRestoreSnapshot().then((s) => setUndoable(s !== undefined))
  }, [])

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    await saveSettings(next)
    void pushSettings(next)
    await onChanged()
  }

  const savePlates = async () => {
    const plates = platesText
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)
    if (plates.length > 0) {
      await update({ platesKg: plates })
      setPlatesText(plates.join(', '))
      flash('Plates saved')
    }
  }

  const flash = (msg: string) => {
    setStatus(msg)
    setTimeout(() => setStatus(null), 2500)
  }

  const doExport = async () => {
    const json = await exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forge-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Backup downloaded')
  }

  /**
   * A restore replaces everything, so it asks first — and says exactly what it
   * is replacing and with what. The dangerous case this closes is a file that
   * parses fine but is empty or from the wrong app: it used to sail through the
   * one `Array.isArray` check and silently wipe the history it "restored".
   */
  const doImport = async (file: File) => {
    let backup
    try {
      backup = parseBackup(await file.text())
    } catch {
      flash('Import failed — not a valid backup')
      return
    }
    const incoming = summarizeBackup(backup)
    const current = await summarizeLocal()
    const dated = incoming.exportedAt ? ` from ${new Date(incoming.exportedAt).toLocaleDateString()}` : ''
    const ok = window.confirm(
      `Restore this backup${dated}?\n\n` +
      `It holds ${incoming.sessions} sessions, ${incoming.exercises} custom exercises, ` +
      `${incoming.days} custom days, ${incoming.goals} goals, ${incoming.bodyweights} bodyweight entries.\n\n` +
      `This replaces what's on this device (${current.sessions} sessions). ` +
      `You can undo it straight afterwards.`,
    )
    if (!ok) return
    try {
      const count = await importData(await file.text())
      await onChanged()
      setUndoable(true)
      flash(`Restored ${count} sessions`)
    } catch {
      flash('Import failed — nothing was changed')
    }
  }

  const doUndo = async () => {
    if (!window.confirm('Put back everything the last restore replaced?')) return
    const done = await undoRestore()
    await onChanged()
    setUndoable(false)
    flash(done ? 'Restore undone' : 'Nothing to undo')
  }

  const doWipe = async () => {
    if (window.confirm('Delete ALL training history and settings? This cannot be undone.')) {
      await wipeAll()
      await onChanged()
      flash('Everything wiped')
    }
  }

  return (
    <>
      <h1 className="screen-title">Setup</h1>
      <p className="screen-sub">Your gym, your bar, your data.</p>

      <div className="section-label">Equipment</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="k">Bar weight</div>
            <div className="sub">Used for plate math and warm-ups</div>
          </div>
          <input type="number" inputMode="decimal" value={settings.barWeightKg}
            onChange={(e) => update({ barWeightKg: Number(e.target.value) || 20 })} />
        </div>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div>
            <div className="k">Plates available (kg, per side)</div>
            <div className="sub">Comma separated — determines loadable weights</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input style={{ flex: 1 }} value={platesText}
              onChange={(e) => setPlatesText(e.target.value)} onBlur={savePlates} />
            <button className="btn-small accent" onClick={savePlates}>Save</button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="k">Rest timer sound</div>
            <div className="sub">Chime when rest is up</div>
          </div>
          <button
            className={`toggle${settings.soundOn ? ' on' : ''}`}
            aria-label="Toggle sound"
            onClick={() => update({ soundOn: !settings.soundOn })}
          />
        </div>
        <RestAlertsRow />
      </div>

      <div className="section-label">Training block</div>
      <TrainingBlock settings={settings} update={update} />

      <div className="section-label">Weekly plan</div>
      <WeeklyPlan settings={settings} update={update} />

      <div className="section-label">Autoregulation</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="k">Readiness check</div>
            <div className="sub">
              Asks how you’re feeling before each session and bends the day’s prescription to match —
              a rough night trims a set and backs the load off 10%, a good one earns an extra set.
            </div>
          </div>
          <button
            className={`toggle${settings.readinessCheck ? ' on' : ''}`}
            aria-label="Toggle readiness check"
            onClick={() => update({ readinessCheck: !settings.readinessCheck })}
          />
        </div>
      </div>

      <div className="section-label">Reminders</div>
      <Reminders settings={settings} update={update} />

      <div className="section-label">Exercises</div>
      <CustomExercises onChanged={onChanged} />

      <div className="section-label">Program</div>
      <CustomDays onChanged={onChanged} />

      {supabaseConfigured && (
        <>
          <div className="section-label">Cloud Backup</div>
          <div className="card">
            <div className="settings-row">
              <div>
                <div className="k">
                  {syncing ? 'Syncing…' : syncError ? 'Backup problem' : 'Cloud sync on ✓'}
                </div>
                <div className="sub">Every session — including edits and deletions — saves to the cloud automatically. Open the app on any device to get your full history back.</div>
              </div>
              <button className="btn-small" onClick={() => onSyncNow()} disabled={syncing}>
                {syncing ? '…' : 'Sync now'}
              </button>
            </div>
            {syncError && !syncing && (
              <div className="sub" style={{ color: '#ff5d5d', marginTop: 4 }}>
                {syncError} We’ll retry on the next change or sync.
              </div>
            )}
            <PrivateSyncKey onSyncNow={onSyncNow} />
          </div>
        </>
      )}

      <div className="section-label">Data</div>
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="k">Export backup</div>
            <div className="sub">Full history as JSON — keep a copy safe</div>
          </div>
          <button className="btn-small accent" onClick={doExport}>Export</button>
        </div>
        <div className="settings-row">
          <div>
            <div className="k">Restore backup</div>
            <div className="sub">
              Replaces everything with the file’s contents — you’ll see what it holds before it runs
            </div>
          </div>
          <button className="btn-small" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }} />
        </div>
        {undoable && (
          <div className="settings-row">
            <div>
              <div className="k">Undo last restore</div>
              <div className="sub">Puts back everything the restore replaced</div>
            </div>
            <button className="btn-small accent" onClick={doUndo}>Undo</button>
          </div>
        )}
        <div className="settings-row">
          <div>
            <div className="k danger">Wipe everything</div>
            <div className="sub">All sessions and settings, gone</div>
          </div>
          <button className="btn-small danger" onClick={doWipe}>Wipe</button>
        </div>
      </div>

      {status && (
        <p style={{ textAlign: 'center', color: 'var(--green)', marginTop: 16, fontSize: 14 }}>
          {status}
        </p>
      )}
    </>
  )
}

// ── Weekly plan ─────────────────────────────────────────
/**
 * Two modes. Automatic derives the week from a session count and the built-in
 * split — the original behaviour, and still the right default. Custom hands
 * over all seven days, and unlike the automatic plan it can schedule *any* day
 * template, so a program built in the Program section actually shows up on the
 * Train screen instead of being crowded out by push/pull/legs.
 */
function WeeklyPlan({ settings, update }: {
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
}) {
  const freq = clampFrequency(settings.weeklyFrequency ?? 4)
  const plan = settings.weekPlan ?? null

  const setSlot = (weekday: number, id: DayId | null) => {
    // Editing an automatic week forks it into a custom one, seeded with what's
    // already on screen — so the first edit never wipes the rest of the week.
    const base: WeekPlan = plan ?? autoWeekPlan(freq)
    const next = base.map((slot, i) => (i === weekday ? id : slot))
    return update({ weekPlan: next })
  }

  return (
    <div className="card">
      <div className="settings-row">
        <div>
          <div className="k">Sessions per week</div>
          <div className="sub">
            {plan
              ? 'Not used while you’re running a custom plan.'
              : `Lays out your week as ${defaultSplit(freq).map(dayLabel).join(' · ')}`}
          </div>
        </div>
        <select value={freq} disabled={plan !== null}
          onChange={(e) => update({ weeklyFrequency: Number(e.target.value) })}>
          {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}×</option>)}
        </select>
      </div>

      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div>
          <div className="k">Your week {plan && <span style={{ color: 'var(--green)' }}>· custom</span>}</div>
          <div className="sub">
            {plan
              ? 'Any day you’ve built can go anywhere. Set every day to Rest to hand the week back to the automatic plan.'
              : 'Assign your own days to weekdays — including the ones you built in Program.'}
          </div>
        </div>
        <div className="plan-editor">
          {(plan ?? autoWeekPlan(freq)).map((slot, wd) => (
            <label className="plan-editor-row" key={wd}>
              <span className="wd-name">{WEEKDAY_NAME[wd]}</span>
              <select value={slot ?? ''} onChange={(e) => setSlot(wd, e.target.value || null)}>
                <option value="">Rest</option>
                {DAYS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          ))}
        </div>
        {plan && (
          <button className="btn-small" style={{ marginTop: 10 }}
            onClick={() => update({ weekPlan: null })}>
            Back to the automatic plan
          </button>
        )}
      </div>
    </div>
  )
}

// ── Rest alerts (background notifications) ───────────────
function RestAlertsRow() {
  const [perm, setPerm] = useState(notificationPermission())
  if (!notificationsSupported()) return null

  const enable = async () => setPerm(await requestNotifications())

  return (
    <div className="settings-row">
      <div>
        <div className="k">Rest alerts</div>
        <div className="sub">
          {perm === 'granted' ? 'Notifies you when rest is up, even with the app in the background'
            : perm === 'denied' ? 'Blocked — enable notifications for this site in your browser'
            : 'Get a notification when rest is up, even if the screen’s off'}
        </div>
      </div>
      {perm === 'granted'
        ? <span className="k" style={{ color: 'var(--green)' }}>On ✓</span>
        : <button className="btn-small accent" onClick={enable} disabled={perm === 'denied'}>Enable</button>}
    </div>
  )
}

// ── Custom exercise manager ─────────────────────────────
function CustomExercises({ onChanged }: { onChanged: () => Promise<void> }) {
  const [list, setList] = useState<Exercise[]>([])
  const [adding, setAdding] = useState(false)

  const reload = async () => setList(await getCustomExercises())
  useEffect(() => { void reload() }, [])

  const remove = async (id: string) => {
    if (!window.confirm('Delete this custom exercise? Past sessions that used it are kept.')) return
    void pushRecord('exercise', id, await deleteCustomExercise(id))
    await reload()
    await onChanged()
  }

  const add = async (exercise: Exercise) => {
    void pushRecord('exercise', exercise.id, await saveCustomExercise(exercise))
    await reload()
    await onChanged()
    setAdding(false)
  }

  return (
    <div className="card">
      {list.length === 0 && !adding && (
        <p className="sub" style={{ padding: '4px 0 12px' }}>
          Add the machines and variations your gym has. Custom lifts show up as swap and add options,
          and get the same progression and stats as the built-ins.
        </p>
      )}
      {list.map((e) => (
        <div className="settings-row" key={e.id}>
          <div>
            <div className="k">{e.name}</div>
            <div className="sub">
              {MUSCLE_LABEL[e.primary]} · {EQUIPMENT_LABEL[e.equipment]} · {e.repRange[0]}–{e.repRange[1]} reps
            </div>
          </div>
          <button className="set-del" aria-label={`Delete ${e.name}`} onClick={() => remove(e.id)}>
            <TrashIcon size={18} />
          </button>
        </div>
      ))}

      {adding ? (
        <ExerciseForm onSave={add} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn-small accent" style={{ marginTop: list.length > 0 ? 12 : 0 }}
          onClick={() => setAdding(true)}>
          + New exercise
        </button>
      )}
    </div>
  )
}

function ExerciseForm({ onSave, onCancel }: {
  onSave: (e: Exercise) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState<Muscle>('chest')
  const [equipment, setEquipment] = useState<Equipment>('machine')
  const [lo, setLo] = useState('8')
  const [hi, setHi] = useState('12')
  const [isCompound, setIsCompound] = useState(false)
  const [cue, setCue] = useState('')

  const valid = name.trim().length > 0 && Number(lo) > 0 && Number(hi) >= Number(lo)

  const submit = async () => {
    if (!valid) return
    const repRange: [number, number] = [Math.round(Number(lo)), Math.round(Number(hi))]
    await onSave(makeCustomExercise({ name, primary, equipment, repRange, isCompound, cue }))
  }

  return (
    <div className="ex-form">
      <input placeholder="Exercise name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="ex-form-grid">
        <label>
          <span>Primary muscle</span>
          <select value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)}>
            {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}
          </select>
        </label>
        <label>
          <span>Equipment</span>
          <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT.map((eq) => <option key={eq} value={eq}>{EQUIPMENT_LABEL[eq]}</option>)}
          </select>
        </label>
        <label>
          <span>Min reps</span>
          <input type="number" inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value)} />
        </label>
        <label>
          <span>Max reps</span>
          <input type="number" inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value)} />
        </label>
      </div>
      <label className="ex-form-check" onClick={() => setIsCompound((c) => !c)}>
        <span className={`toggle${isCompound ? ' on' : ''}`} />
        <span>Compound lift (adds warm-up ramps)</span>
      </label>
      <input placeholder="Coaching cue (optional)" value={cue} onChange={(e) => setCue(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn-small" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn-small accent" style={{ flex: 1, opacity: valid ? 1 : 0.4 }}
          disabled={!valid} onClick={submit}>Save exercise</button>
      </div>
    </div>
  )
}

// ── Training block (mesocycle) ──────────────────────────
const BLOCK_LENGTHS = [3, 4, 5, 6]

function TrainingBlock({ settings, update }: {
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
}) {
  const [weeks, setWeeks] = useState(settings.meso?.weeks ?? 4)
  const phase = phaseFor(settings.meso, Date.now())

  const start = () => update({ meso: { startAt: Date.now(), weeks } })
  const end = () => update({ meso: null })

  if (settings.meso && phase) {
    return (
      <div className="card">
        <div className="settings-row">
          <div>
            <div className="k">{phase.label}</div>
            <div className="sub">{phase.note}</div>
          </div>
          <button className="btn-small" onClick={end}>End block</button>
        </div>
        <div className="sub" style={{ paddingTop: 8 }}>
          Accumulation weeks ramp your prescribed sets; the last week is a planned deload. The block
          rolls into a fresh cycle automatically.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div>
          <div className="k">Run a mesocycle</div>
          <div className="sub">
            Ramp volume week to week, then auto-schedule a deload — structured progression instead of grinding every session.
          </div>
        </div>
        <div className="seg" style={{ marginTop: 12 }}>
          {BLOCK_LENGTHS.map((w) => (
            <button key={w} className={weeks === w ? 'on' : ''} onClick={() => setWeeks(w)}>{w} wk</button>
          ))}
        </div>
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={start}>
          Start {weeks}-week block
        </button>
      </div>
    </div>
  )
}

// ── Daily training reminder ─────────────────────────────
const REMINDER_HOURS = [7, 9, 12, 15, 17, 19]

function Reminders({ settings, update }: {
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
}) {
  const on = !!settings.reminder
  const hour = settings.reminder?.hour ?? 17
  const [perm, setPerm] = useState(notificationPermission())

  const toggle = () => update({ reminder: on ? null : { hour } })
  const setHour = (h: number) => update({ reminder: { hour: h } })
  const enableNotifs = async () => setPerm(await requestNotifications())

  const fmtHour = (h: number) => {
    const am = h < 12
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}${am ? 'am' : 'pm'}`
  }

  return (
    <div className="card">
      <div className="settings-row">
        <div>
          <div className="k">Time to train</div>
          <div className="sub">A daily nudge to train if you haven’t yet — names the day the coach picks.</div>
        </div>
        <button className={`toggle${on ? ' on' : ''}`} aria-label="Toggle training reminder" onClick={toggle} />
      </div>
      {on && (
        <>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="k">Remind me at</div>
            <div className="seg" style={{ marginTop: 10 }}>
              {REMINDER_HOURS.map((h) => (
                <button key={h} className={hour === h ? 'on' : ''} onClick={() => setHour(h)}>{fmtHour(h)}</button>
              ))}
            </div>
          </div>
          {notificationsSupported() && perm !== 'granted' && (
            <div className="settings-row">
              <div>
                <div className="k">Allow notifications</div>
                <div className="sub">
                  {perm === 'denied'
                    ? 'Blocked — enable notifications for this site in your browser'
                    : 'Needed to nudge you; otherwise it only shows when the app is open'}
                </div>
              </div>
              <button className="btn-small accent" onClick={enableNotifs} disabled={perm === 'denied'}>Enable</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Private cloud-backup key ────────────────────────────
/**
 * The key is the whole access-control story: rows are scoped to a bucket named
 * `forge-<sha256(key)>`, so holding the key is what reaches the data. New
 * installs get a random one automatically; this pane exists to show it (so a
 * second device can be paired), to let it be replaced, and to offer the switch
 * to installs still on the old shared bucket.
 */
function PrivateSyncKey({ onSyncNow }: { onSyncNow: () => Promise<void> }) {
  const [key, setKey] = useState<string | null>(getSyncKey())
  const [entering, setEntering] = useState(false)
  const [value, setValue] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const apply = async (next: string) => {
    const trimmed = next.trim()
    if (trimmed.length < 4) return
    setSyncKey(trimmed)
    setKey(trimmed)
    setEntering(false)
    setValue('')
    setRevealed(false)
    // Re-syncing under the new bucket re-uploads everything held locally.
    await onSyncNow()
  }

  const copy = async () => {
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setRevealed(true)
    }
  }

  const goPrivate = async () => {
    if (!window.confirm('Move this device to its own private backup bucket? Your history re-uploads under the new key. Save the key — you need it to reach this backup from another device.')) return
    await apply(generateSyncKey())
    setRevealed(true)
  }

  const useShared = async () => {
    if (!window.confirm('Switch back to the shared public bucket? Anyone who finds this app’s URL can read or overwrite data there. Your private backup stays in the cloud but this device stops using it.')) return
    setSyncKey(null)
    setKey(null)
    setRevealed(false)
    await onSyncNow()
  }

  return (
    <div className="settings-row sync-key">
      <div>
        <div className="k">
          {key ? <>Private backup <span style={{ color: 'var(--green)' }}>· on ✓</span></> : 'Shared public bucket'}
        </div>
        <div className="sub">
          {key
            ? 'Your backup lives in a bucket only this key can address. Enter the same key on another device to share history.'
            : 'This device is on the bucket every install used to share — its name ships in the app, so anyone with the URL can read or overwrite it. Switching gives you a bucket of your own.'}
        </div>
      </div>

      {key && !entering && (
        <>
          <div className="key-display num">{revealed ? key : '•••••-•••••-•••••-•••••'}</div>
          <div className="key-actions">
            <button className="btn-small" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button className="btn-small accent" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            <button className="btn-small" onClick={() => setEntering(true)}>Enter a key</button>
          </div>
          <div className="sub" style={{ marginTop: 8 }}>
            Keep a copy somewhere safe. Lose it and this device still has your data, but no new
            device can reach the backup.
          </div>
        </>
      )}

      {entering && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input style={{ flex: 1 }} placeholder="Paste a key from another device" value={value}
            onChange={(e) => setValue(e.target.value)} autoFocus />
          <button className="btn-small accent" onClick={() => apply(value)} disabled={value.trim().length < 4}>
            Use it
          </button>
          <button className="btn-small" onClick={() => { setEntering(false); setValue('') }}>Cancel</button>
        </div>
      )}

      {!key && !entering && (
        <div className="key-actions">
          <button className="btn-small accent" onClick={goPrivate}>Give me a private bucket</button>
          <button className="btn-small" onClick={() => setEntering(true)}>Enter a key</button>
        </div>
      )}

      {key && !entering && (
        <button className="btn-small danger" style={{ marginTop: 10, alignSelf: 'flex-start' }}
          onClick={useShared}>
          Use the shared bucket
        </button>
      )}
    </div>
  )
}

// ── Program builder (custom days) ───────────────────────
function CustomDays({ onChanged }: { onChanged: () => Promise<void> }) {
  const [list, setList] = useState<DayTemplate[]>([])
  const [adding, setAdding] = useState(false)

  const reload = async () => setList(await getCustomDays())
  useEffect(() => { void reload() }, [])

  const remove = async (id: string) => {
    if (!window.confirm('Delete this day? Past sessions logged under it are kept.')) return
    void pushRecord('day', id, await deleteCustomDay(id))
    await reload()
    await onChanged()
  }
  const add = async (day: DayTemplate) => {
    void pushRecord('day', String(day.id), await saveCustomDay(day))
    await reload()
    await onChanged()
    setAdding(false)
  }

  return (
    <div className="card">
      {list.length === 0 && !adding && (
        <p className="sub" style={{ padding: '4px 0 12px' }}>
          Build your own split — upper/lower, full-body, whatever you run. Custom days appear on Train
          with the same rotation, progression, and stats as the built-ins.
        </p>
      )}
      {list.map((d) => (
        <div className="settings-row" key={d.id}>
          <div>
            <div className="k">{d.name}</div>
            <div className="sub">
              {d.slots.length} exercise{d.slots.length === 1 ? '' : 's'} · {d.muscles.map((m) => MUSCLE_LABEL[m]).join(', ')}
            </div>
          </div>
          <button className="set-del" aria-label={`Delete ${d.name}`} onClick={() => remove(d.id)}>
            <TrashIcon size={18} />
          </button>
        </div>
      ))}
      {adding ? (
        <DayForm onSave={add} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn-small accent" style={{ marginTop: list.length > 0 ? 12 : 0 }}
          onClick={() => setAdding(true)}>
          + New day
        </button>
      )}
    </div>
  )
}

function DayForm({ onSave, onCancel }: {
  onSave: (d: DayTemplate) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [picks, setPicks] = useState<string[]>([])
  const [picking, setPicking] = useState(false)

  const valid = name.trim().length > 0 && picks.length > 0

  const submit = async () => {
    if (!valid) return
    const slots: DaySlot[] = picks.map((id) => {
      const ex = EXERCISES.find((e) => e.id === id)!
      return { muscle: ex.primary, pool: [id] }
    })
    await onSave(makeCustomDay({ name, slots }))
  }

  return (
    <div className="ex-form">
      <input placeholder="Day name — e.g. Upper A" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      {picks.map((id, i) => {
        const ex = EXERCISES.find((e) => e.id === id)
        return (
          <div className="preview-row" key={id}>
            <div style={{ minWidth: 0 }}>
              <div className="name">{ex?.name ?? id}</div>
              <div className="detail">{ex ? MUSCLE_LABEL[ex.primary] : ''}</div>
            </div>
            <button className="swap-btn" aria-label={`Remove ${ex?.name}`}
              onClick={() => setPicks((p) => p.filter((_, idx) => idx !== i))}>
              <TrashIcon size={16} />
            </button>
          </div>
        )
      })}
      {picking ? (
        <ExercisePicker existing={picks} onPick={(id) => { setPicks((p) => [...p, id]); setPicking(false) }}
          onCancel={() => setPicking(false)} />
      ) : (
        <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>+ Add exercise</button>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-small" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn-small accent" style={{ flex: 1, opacity: valid ? 1 : 0.4 }}
          disabled={!valid} onClick={submit}>Save day</button>
      </div>
    </div>
  )
}
