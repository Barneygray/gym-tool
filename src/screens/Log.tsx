import { useMemo, useState } from 'react'
import type { Session, SetLog } from '../types'
import { exerciseById } from '../data/exercises'
import { dayById } from '../data/days'
import { deleteSession, updateSession } from '../db/db'
import { pushSession } from '../db/sync'
import { CloseIcon, TrashIcon } from '../components/Icons'

interface LogProps {
  history: Session[]
  onChanged: () => Promise<void>
}

function dayName(dayType: Session['dayType']): string {
  return dayType === 'conditioning' ? 'Conditioning' : dayById.get(dayType)?.name ?? dayType
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
  const sorted = useMemo(() => [...history].sort((a, b) => b.startedAt - a.startedAt), [history])
  const open = sorted.find((s) => s.uuid === openUuid) ?? null

  if (history.length === 0) {
    return (
      <>
        <h1 className="screen-title">Log</h1>
        <div className="empty-state">
          <div className="big">📓</div>
          No sessions yet.<br />
          Every workout you finish shows up here — tap one to review or fix it.
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="screen-title">Log</h1>
      <p className="screen-sub">Every session you’ve logged — tap to review, edit, or delete.</p>

      {sorted.map((s) => {
        const { sets, tonnage } = sessionStats(s)
        return (
          <button key={s.uuid} className="day-card log-card" onClick={() => setOpenUuid(s.uuid)}>
            <div>
              <h3>{dayName(s.dayType)}</h3>
              <div className="meta">{fmtDate(s.startedAt)} · {s.entries.length} exercises · {sets} sets</div>
            </div>
            <div className="log-ton num">{formatTonnage(tonnage)}</div>
          </button>
        )
      })}

      {open && (
        <SessionDetail
          key={open.uuid}
          session={open}
          onClose={() => setOpenUuid(null)}
          onChanged={onChanged}
        />
      )}
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
            <h2 className="screen-title" style={{ fontSize: 24 }}>{dayName(session.dayType)}</h2>
            <p className="screen-sub" style={{ marginBottom: 0 }}>{fmtDateLong(session.startedAt)}</p>
          </div>
          <button className="sheet-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        {entries.map((entry, ei) => {
          const name = exerciseById.get(entry.exerciseId)?.name ?? entry.exerciseId
          return (
            <div className="log-entry" key={entry.exerciseId + ei}>
              <div className="section-label" style={{ margin: '16px 0 8px' }}>{name}</div>
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

        <div style={{ height: 18 }} />
        {dirty && !isConditioning && (
          <button className="btn-primary" onClick={save}>Save changes</button>
        )}
        <button className="btn-ghost danger" style={{ marginTop: 10 }} onClick={remove}>
          Delete session
        </button>
      </div>
    </>
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`
}

function fmtDateLong(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'long' })
}

function formatTonnage(kg: number): string {
  if (kg <= 0) return '—'
  return kg >= 10000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)} kg`
}
