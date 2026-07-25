import { useMemo, useState } from 'react'
import type { Session } from '../types'
import { MOBILITY } from '../types'
import { STRETCH_GROUPS, DESK_RESCUE, type StretchGroup } from '../data/stretches'
import { saveSession } from '../db/db'
import { pushSession } from '../db/sync'
import { daysSinceStretched, STALE_AFTER } from '../engine/mobility'
import { CheckIcon } from '../components/Icons'

interface StretchProps {
  history: Session[]
  onLogged: () => Promise<void>
  /** Group ids to highlight, e.g. the ones offered after a session. */
  focus?: string[]
}

/**
 * Mobility is logged the same way conditioning is, and syncs the same way — but
 * stretches are deliberately absent from the exercise catalog, so they never
 * reach tonnage, weekly hard sets, or muscle freshness. A stretch isn't a hard
 * set and shouldn't be counted as one. What it gets instead is staleness
 * tracking, which is the part that actually makes it happen.
 */
export function StretchScreen({ history, onLogged, focus = [] }: StretchProps) {
  const [mode, setMode] = useState<'muscles' | 'desk'>('muscles')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const now = Date.now()
  const since = useMemo(() => daysSinceStretched(history, now), [history, now])

  const groups = mode === 'muscles' ? STRETCH_GROUPS : DESK_RESCUE

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const logSelected = async () => {
    const t = Date.now()
    const session: Session = {
      uuid: crypto.randomUUID(),
      dayType: MOBILITY,
      startedAt: t,
      finishedAt: t,
      entries: [...selected].map((id) => ({ exerciseId: id, sets: [{ weight: 0, reps: 1 }] })),
    }
    await saveSession(session)
    void pushSession(session)
    setSelected(new Set())
    await onLogged()
  }

  return (
    <>
      <div className="screen-head">
        <h1 className="screen-title">Stretch</h1>
        <span className="micro">
          {mode === 'muscles' ? 'After training, warm' : 'Daily'}
        </span>
      </div>

      <div className="seg" role="radiogroup" aria-label="Stretch set">
        <button role="radio" aria-checked={mode === 'muscles'}
          className={mode === 'muscles' ? 'on' : ''} onClick={() => setMode('muscles')}>
          By muscle
        </button>
        <button role="radio" aria-checked={mode === 'desk'}
          className={mode === 'desk' ? 'on' : ''} onClick={() => setMode('desk')}>
          Desk rescue
        </button>
      </div>

      {groups.map((g) => (
        <GroupBlock
          key={g.id}
          group={g}
          days={since.get(g.id) ?? Infinity}
          highlighted={focus.includes(g.id)}
          selected={selected}
          onToggle={toggle}
        />
      ))}

      {selected.size > 0 && (
        <>
          <div style={{ height: 'var(--s5)' }} />
          <button className="btn-primary" onClick={logSelected}>
            Log {selected.size} stretch{selected.size > 1 ? 'es' : ''} done
          </button>
        </>
      )}
    </>
  )
}

function GroupBlock({ group, days, highlighted, selected, onToggle }: {
  group: StretchGroup
  days: number
  highlighted: boolean
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  const stale = days >= STALE_AFTER

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="section-label stretch-head">
        <span>{group.name}</span>
        <span className={`stretch-since${stale ? ' stale' : ''}`}>
          {days === Infinity ? 'never' : days < 1 ? 'today' : `${Math.floor(days)}d ago`}
        </span>
      </div>
      <div className={`card pane${highlighted ? ' focus' : ''}`}>
        {group.stretches.map((s) => {
          const isOn = selected.has(s.id)
          return (
            <div
              className="stretch-row"
              key={s.id}
              role="checkbox"
              aria-checked={isOn}
              tabIndex={0}
              onClick={() => onToggle(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle(s.id)
                }
              }}
            >
              {/* A real box. Selection used to be a "● " glued to the front of
                  the name, which shifted the whole line on every tap. */}
              <span className="check" aria-hidden="true"><CheckIcon /></span>
              <div>
                <div className="top">
                  <span className="name">{s.name}</span>
                  <span className="hold num">{s.holdSec}s{s.perSide ? ' / side' : ''}</span>
                </div>
                <div className="targets">{s.targets}</div>
                <div className="cue">{s.cue}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
