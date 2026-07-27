import { useMemo, useState } from 'react'
import type { DayId, Session, SetLog } from '../types'
import { FREESTYLE, MOBILITY } from '../types'
import { exerciseById, getExercise, loadBasisTag } from '../data/exercises'
import { DAYS, dayById } from '../data/days'
import { deleteSession, saveSession, updateSession } from '../db/db'
import { pushSession } from '../db/sync'
import { ExercisePicker } from '../components/ExercisePicker'
import { BookIcon, CloseIcon, TrashIcon } from '../components/Icons'

interface LogProps {
  history: Session[]
  onChanged: () => Promise<void>
}

function dayName(dayType: Session['dayType']): string {
  if (dayType === 'conditioning') return 'Conditioning'
  // Mobility sessions have no day template, so they fell through to the raw
  // id and listed themselves in the log as a lowercase "mobility".
  if (dayType === MOBILITY) return 'Mobility'
  if (dayType === FREESTYLE) return 'Freestyle'
  return dayById.get(dayType)?.name ?? dayType
}

/**
 * The row's detail line, minus the date — the date is its own left-hand column
 * in the ledger now. Mobility logs no sets at all, so it doesn't get a set
 * count: it used to read "0 exercises · 0 sets", describing a session that
 * never happened.
 */
function sessionMeta(session: Session, sets: number): string {
  const n = session.entries.length
  if (sets === 0) return n > 0 ? plural(n, 'movement') : 'Logged'
  return `${plural(n, 'exercise')} · ${plural(sets, 'set')}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`
}

/** `yyyy-mm-dd` in local time, for `<input type="date">`. */
function dateInputValue(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Midday on the given local date — away from DST edges and timezone rollover. */
function dateFromInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

function sessionStats(session: Session): { sets: number; tonnage: number } {
  let sets = 0
  let tonnage = 0
  for (const e of session.entries) {
    for (const s of e.sets) {
      sets += 1
      tonnage += s.weight * s.reps
    }
  }
  return { sets, tonnage }
}

export function LogScreen({ history, onChanged }: LogProps) {
  const [openUuid, setOpenUuid] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const sorted = useMemo(() => [...history].sort((a, b) => b.startedAt - a.startedAt), [history])
  const open = sorted.find((s) => s.uuid === openUuid) ?? null

  const addButton = (
    <button className="btn-ghost mt-3" onClick={() => setAdding(true)}>
      + Add a past session
    </button>
  )

  if (history.length === 0) {
    return (
      <>
        <div className="screen-head">
          <h1 className="screen-title">Log</h1>
        </div>
        <div className="empty-state">
          <div className="big" aria-hidden="true"><BookIcon /></div>
          No sessions yet. Every workout you finish shows up here — tap one to
          review or fix it.
        </div>
        {addButton}
        {adding && <AddSession onClose={() => setAdding(false)} onChanged={onChanged} />}
      </>
    )
  }

  return (
    <>
      <div className="screen-head">
        <h1 className="screen-title">Log</h1>
        <span className="micro">{plural(history.length, 'session')}</span>
      </div>

      {sorted.map((s) => {
        const { sets, tonnage } = sessionStats(s)
        return (
          <button key={s.uuid} className="day-card log-card" onClick={() => setOpenUuid(s.uuid)}>
            {/* Date is its own key column, so dates line up down the page
                instead of being buried mid-sentence in the detail line. */}
            <span className="rowkey">{fmtDate(s.startedAt)}</span>
            <div>
              <h3>{dayName(s.dayType)}</h3>
              <div className="meta">{sessionMeta(s, sets)}</div>
            </div>
            <div className={`log-ton${tonnage <= 0 ? ' none' : ''}`}>
              {tonnage <= 0 ? '—' : <>{formatTonnage(tonnage)}<span>{tonnage >= 10000 ? 't' : 'kg'}</span></>}
            </div>
          </button>
        )
      })}

      {addButton}

      {open && (
        <SessionDetail
          key={open.uuid}
          session={open}
          onClose={() => setOpenUuid(null)}
          onChanged={onChanged}
        />
      )}
      {adding && <AddSession onClose={() => setAdding(false)} onChanged={onChanged} />}
    </>
  )
}

// ── Backfill a session trained outside the app ──────────
/**
 * Sessions could previously only be created by walking through a live workout,
 * so anything trained without the phone to hand simply never entered the log —
 * and every calculation built on the history silently worked from an incomplete
 * picture: stall detection counting sessions that weren't all recorded, muscle
 * freshness reading rested when it wasn't, consistency undercounting.
 *
 * This writes through the same `saveSession`/`pushSession` path as a live
 * workout; only the timestamp differs.
 */
function AddSession({ onClose, onChanged }: {
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [date, setDate] = useState(() => dateInputValue(Date.now()))
  const [dayType, setDayType] = useState<DayId>(DAYS[0]?.id ?? FREESTYLE)
  const [entries, setEntries] = useState<{ exerciseId: string; sets: SetLog[] }[]>([])
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  const addExercise = (id: string) => {
    setEntries((prev) => [...prev, { exerciseId: id, sets: [{ weight: 0, reps: 0 }] }])
    setPicking(false)
  }
  const patchSet = (ei: number, si: number, patch: Partial<SetLog>) =>
    setEntries((prev) => prev.map((e, i) =>
      i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e,
    ))
  const addSet = (ei: number) =>
    setEntries((prev) => prev.map((e, i) =>
      i === ei ? { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { weight: 0, reps: 0 }) }] } : e,
    ))
  const removeSet = (ei: number, si: number) =>
    setEntries((prev) => prev.map((e, i) =>
      i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e,
    ))
  const removeEntry = (ei: number) => setEntries((prev) => prev.filter((_, i) => i !== ei))

  // Only sets with reps count — an empty row is a row you started and abandoned.
  const cleaned = entries
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps > 0) }))
    .filter((e) => e.sets.length > 0)
  const valid = cleaned.length > 0 && date !== ''

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const startedAt = dateFromInput(date)
    const session: Session = {
      uuid: crypto.randomUUID(),
      dayType,
      startedAt,
      finishedAt: startedAt,
      entries: cleaned,
    }
    await saveSession(session)
    void pushSession(session)
    await onChanged()
    onClose()
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">Add a past session</h2>
            <p className="sheet-sub">
              Trained without your phone? Put it in the log so the engine sees it.
            </p>
          </div>
          <button className="icon-btn sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="add-session-head">
          <label className="log-field wide">
            <span>Date</span>
            <input type="date" value={date} max={dateInputValue(Date.now())}
              onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="log-field wide">
            <span>Session</span>
            <select value={dayType} onChange={(e) => setDayType(e.target.value)}>
              {DAYS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value={FREESTYLE}>Freestyle</option>
            </select>
          </label>
        </div>

        {entries.map((entry, ei) => {
          const exercise = getExercise(entry.exerciseId)
          const basisTag = loadBasisTag(exercise)
          return (
            <div className="log-entry" key={entry.exerciseId + ei}>
              <div className="add-entry-head">
                <div className="section-label" style={{ margin: 0 }}>
                  <span>{exercise.name}</span>
                  {basisTag && <span>{basisTag}</span>}
                </div>
                <button className="set-del" aria-label={`Remove ${exercise.name}`}
                  onClick={() => removeEntry(ei)}>
                  <TrashIcon size={16} />
                </button>
              </div>
              {entry.sets.map((s, si) => (
                <div className="log-set-row" key={si}>
                  <span className="idx num">S{si + 1}</span>
                  <label className="log-field">
                    <input className="num" type="number" inputMode="decimal" value={s.weight}
                      onChange={(e) => patchSet(ei, si, { weight: Number(e.target.value) || 0 })} />
                    <span>kg</span>
                  </label>
                  <span className="times">×</span>
                  <label className="log-field">
                    <input className="num" type="number" inputMode="numeric" value={s.reps || ''}
                      onChange={(e) => patchSet(ei, si, { reps: Number(e.target.value) || 0 })} />
                    <span>reps</span>
                  </label>
                  <button className="set-del" aria-label={`Delete set ${si + 1}`}
                    onClick={() => removeSet(ei, si)}>
                    <TrashIcon size={16} />
                  </button>
                </div>
              ))}
              <button className="btn-small" style={{ marginTop: 'var(--s2)' }} onClick={() => addSet(ei)}>+ Set</button>
            </div>
          )
        })}

        {picking ? (
          <ExercisePicker
            existing={entries.map((e) => e.exerciseId)}
            placeholder="Which lift?"
            onPick={addExercise}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <button className="btn-ghost mt-3" onClick={() => setPicking(true)}>
            + Add exercise
          </button>
        )}

        <div style={{ height: 'var(--s4)' }} />
        <button className="btn-primary" onClick={save} disabled={!valid || saving}>
          Save session
        </button>
      </div>
    </>
  )
}

function SessionDetail({ session, onClose, onChanged }: {
  session: Session
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  // Editable working copy; committed only when the user saves.
  const [entries, setEntries] = useState(() => session.entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })))
  const [dirty, setDirty] = useState(false)
  const isConditioning = session.dayType === 'conditioning'

  const editSet = (ei: number, si: number, patch: Partial<SetLog>) => {
    setEntries((prev) => prev.map((e, i) =>
      i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e,
    ))
    setDirty(true)
  }

  const removeSet = (ei: number, si: number) => {
    setEntries((prev) => prev.map((e, i) =>
      i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e,
    ))
    setDirty(true)
  }

  const save = async () => {
    const cleaned = entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps > 0) }))
      .filter((e) => e.sets.length > 0)
    if (cleaned.length === 0) {
      await remove()
      return
    }
    const edited: Session = { ...session, entries: cleaned, updatedAt: Date.now() }
    await updateSession(edited)
    void pushSession(edited)
    await onChanged()
    onClose()
  }

  const remove = async () => {
    if (!window.confirm('Delete this whole session? This cannot be undone.')) return
    const tombstoned = await deleteSession(session.uuid)
    if (tombstoned) void pushSession(tombstoned)
    await onChanged()
    onClose()
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">{dayName(session.dayType)}</h2>
            <p className="sheet-sub">{fmtDateLong(session.startedAt)}</p>
          </div>
          <button className="icon-btn sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </div>

        {entries.map((entry, ei) => {
          const exercise = exerciseById.get(entry.exerciseId)
          const name = exercise?.name ?? entry.exerciseId
          const basisTag = exercise ? loadBasisTag(exercise) : null
          return (
            <div className="log-entry" key={entry.exerciseId + ei}>
              <div className="section-label" style={{ margin: 'var(--s5) 0 var(--s1)' }}>
                <span>{name}</span>
                {basisTag && <span>{basisTag}</span>}
              </div>
              {isConditioning ? (
                <div className="log-cond num">Logged done</div>
              ) : entry.sets.length === 0 ? (
                <div className="log-cond num" style={{ color: 'var(--text-faint)' }}>All sets removed</div>
              ) : (
                entry.sets.map((s, si) => (
                  <div className="log-set-row" key={si}>
                    <span className="idx num">S{si + 1}</span>
                    <label className="log-field">
                      <input className="num" type="number" inputMode="decimal" value={s.weight}
                        onChange={(e) => editSet(ei, si, { weight: Number(e.target.value) || 0 })} />
                      <span>kg</span>
                    </label>
                    <span className="times">×</span>
                    <label className="log-field">
                      <input className="num" type="number" inputMode="numeric" value={s.reps}
                        onChange={(e) => editSet(ei, si, { reps: Number(e.target.value) || 0 })} />
                      <span>reps</span>
                    </label>
                    {s.rpe !== undefined && <span className="log-rpe num">RPE {s.rpe}</span>}
                    <button className="set-del" aria-label={`Delete set ${si + 1}`} onClick={() => removeSet(ei, si)}>
                      <TrashIcon size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )
        })}

        <div style={{ height: 'var(--s5)' }} />
        {dirty && !isConditioning && (
          <button className="btn-primary" onClick={save}>Save changes</button>
        )}
        <button className="btn-ghost danger mt-3" onClick={remove}>
          Delete session
        </button>
      </div>
    </>
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })}`
}

function fmtDateLong(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'long' })
}

/** The number only — the unit is rendered as its own dimmed span. */
function formatTonnage(kg: number): string {
  return kg >= 10000 ? (kg / 1000).toFixed(1) : Math.round(kg).toLocaleString()
}
