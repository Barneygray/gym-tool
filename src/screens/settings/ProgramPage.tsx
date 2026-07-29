import { useEffect, useState } from 'react'
import type { DaySlot, DayTemplate, Equipment, Exercise, Muscle, Settings } from '../../types'
import {
  deleteCustomDay, deleteCustomExercise, getCustomDays, getCustomExercises,
  saveCustomDay, saveCustomExercise,
} from '../../db/db'
import { EXERCISES, loadBasisTag, makeCustomExercise } from '../../data/exercises'
import { makeCustomDay } from '../../data/days'
import { excludedIds, toggleExcluded } from '../../engine/exclusions'
import { pushRecord } from '../../db/sync'
import { ExercisePicker } from '../../components/ExercisePicker'
import { TrashIcon } from '../../components/Icons'
import {
  EQUIPMENT, EQUIPMENT_LABEL, MUSCLES, MUSCLE_LABEL, SetupPage, type UpdateSettings,
} from './shared'

export function ProgramPage({ settings, update, onChanged, onBack }: {
  settings: Settings
  update: UpdateSettings
  onChanged: () => Promise<void>
  onBack: () => void
}) {
  return (
    <SetupPage
      title="Program"
      blurb="The menu the coach picks from — your own training days, the lifts your gym has, and the ones you never want prescribed."
      onBack={onBack}
    >
      <div className="section-label">Your days</div>
      <CustomDays settings={settings} onChanged={onChanged} />

      <div className="section-label">Your exercises</div>
      <CustomExercises onChanged={onChanged} />

      <div className="section-label">Never prescribe</div>
      <ExcludedExercises settings={settings} update={update} />
    </SetupPage>
  )
}

// ── Program builder (custom days) ───────────────────────
function CustomDays({ settings, onChanged }: { settings: Settings; onChanged: () => Promise<void> }) {
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
    <div className="card pane">
      {list.length === 0 && !adding && (
        <p className="sub" style={{ marginBottom: 'var(--s3)' }}>
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
        <DayForm settings={settings} onSave={add} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn-small" style={{ marginTop: list.length > 0 ? 'var(--s3)' : 0 }}
          onClick={() => setAdding(true)}>
          + New day
        </button>
      )}
    </div>
  )
}

function DayForm({ settings, onSave, onCancel }: {
  settings: Settings
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
        <ExercisePicker existing={picks} excluded={excludedIds(settings)}
          onPick={(id) => { setPicks((p) => [...p, id]); setPicking(false) }}
          onCancel={() => setPicking(false)} />
      ) : (
        <button className="btn-ghost mt-3" onClick={() => setPicking(true)}>+ Add exercise</button>
      )}
      <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
        <button className="btn-small" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn-small accent" style={{ flex: 1 }}
          disabled={!valid} onClick={submit}>Save day</button>
      </div>
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
    <div className="card pane">
      {list.length === 0 && !adding && (
        <p className="sub" style={{ marginBottom: 'var(--s3)' }}>
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
              {loadBasisTag(e) && ` · ${loadBasisTag(e)}`}
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
        <button className="btn-small" style={{ marginTop: list.length > 0 ? 'var(--s3)' : 0 }}
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
  const [bothHands, setBothHands] = useState(true)
  const [cue, setCue] = useState('')

  // Only hand-held lifts have the question to answer; a bar or a stack is just
  // the weight. Kept out of `makeCustomExercise`'s way for anything else.
  const handHeld = equipment === 'dumbbell' || equipment === 'kettlebell'

  const valid = name.trim().length > 0 && Number(lo) > 0 && Number(hi) >= Number(lo)

  const submit = async () => {
    if (!valid) return
    const repRange: [number, number] = [Math.round(Number(lo)), Math.round(Number(hi))]
    await onSave(makeCustomExercise({
      name, primary, equipment, repRange, isCompound, cue,
      loadBasis: handHeld && !bothHands ? 'single' : 'per-hand',
    }))
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
      <button type="button" className="ex-form-check" role="switch" aria-checked={isCompound}
        onClick={() => setIsCompound((c) => !c)}>
        <span className={`toggle${isCompound ? ' on' : ''}`} />
        <span>Compound lift (adds warm-up ramps)</span>
      </button>
      {handHeld && (
        <button type="button" className="ex-form-check" role="switch" aria-checked={bothHands}
          onClick={() => setBothHands((b) => !b)}>
          <span className={`toggle${bothHands ? ' on' : ''}`} />
          <span>
            {bothHands
              ? 'One in each hand — log a single bell’s weight'
              : 'One bell only — log that bell’s weight'}
          </span>
        </button>
      )}
      <input placeholder="Coaching cue (optional)" value={cue} onChange={(e) => setCue(e.target.value)} />
      <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
        <button className="btn-small" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn-small accent" style={{ flex: 1 }}
          disabled={!valid} onClick={submit}>Save exercise</button>
      </div>
    </div>
  )
}

// ── Excluded exercises ──────────────────────────────────
/**
 * Some lifts are simply not on the menu — a cranky lower back and deadlifts, a
 * shoulder that hates overhead pressing, or plain dislike. Swapping one away
 * every time it came up was the only answer the app had, and the rotation
 * offered it straight back next session. Excluding is that decision made once:
 * the lift leaves the rotation, the swap suggestions and the add lists, on
 * every gym and (settings being synced) every device.
 */
function ExcludedExercises({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const [picking, setPicking] = useState(false)
  const excluded = settings.excluded ?? []

  const add = async (id: string) => {
    setPicking(false)
    await update({ excluded: toggleExcluded(settings, id) })
  }

  const remove = (id: string) => update({ excluded: excluded.filter((x) => x !== id) })

  return (
    <div className="card pane">
      {excluded.length === 0 && !picking && (
        <p className="sub" style={{ marginBottom: 'var(--s3)' }}>
          Lifts you never do. Exclude one and it stops being prescribed — out of the day rotation,
          out of the swap suggestions, out of the add lists. Nothing already logged is touched, and
          you can always search for it by name if you change your mind for a session.
        </p>
      )}
      {excluded.map((id) => {
        const ex = EXERCISES.find((e) => e.id === id)
        return (
          <div className="settings-row" key={id}>
            <div>
              <div className="k">{ex?.name ?? id}</div>
              <div className="sub">
                {ex ? `${MUSCLE_LABEL[ex.primary]} · ${EQUIPMENT_LABEL[ex.equipment]} · never prescribed` : 'No longer in the catalog'}
              </div>
            </div>
            <button className="btn-small" onClick={() => remove(id)}>Allow</button>
          </div>
        )
      })}

      {picking ? (
        <ExercisePicker existing={excluded} placeholder="Which lift do you never do?"
          onPick={add} onCancel={() => setPicking(false)} />
      ) : (
        <button className="btn-small" style={{ marginTop: excluded.length > 0 ? 'var(--s3)' : 0 }}
          onClick={() => setPicking(true)}>
          + Exclude an exercise
        </button>
      )}
    </div>
  )
}
