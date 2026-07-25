import { useMemo, useState } from 'react'
import type { Session } from '../types'
import { CONDITIONING, setsInScheme } from '../data/conditioning'
import { saveSession } from '../db/db'
import { pushSession } from '../db/sync'
import { daysSince } from '../engine/stats'
import { CheckIcon } from '../components/Icons'

const PURPOSE_LABEL = { power: 'Power', core: 'Core', spine: 'Spine' } as const
type Filter = 'all' | 'power' | 'core' | 'spine'

interface ConditioningProps {
  history: Session[]
  onLogged: () => Promise<void>
}

export function ConditioningScreen({ history, onLogged }: ConditioningProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const now = Date.now()

  const lastDone = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of history) {
      if (s.dayType !== 'conditioning') continue
      for (const e of s.entries) {
        map.set(e.exerciseId, Math.max(map.get(e.exerciseId) ?? 0, s.startedAt))
      }
    }
    return map
  }, [history])

  const moves = filter === 'all'
    ? CONDITIONING
    : CONDITIONING.filter((m) => m.purpose.includes(filter))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const logSelected = async () => {
    const t = Date.now()
    const session: Session = {
      uuid: crypto.randomUUID(),
      dayType: 'conditioning',
      startedAt: t,
      finishedAt: t,
      // Log the scheme's actual set count rather than a single "done" marker,
      // so a swing session reads as five hard sets of posterior chain in the
      // weekly volume charts instead of one.
      entries: [...selected].map((id) => ({
        exerciseId: id,
        sets: Array.from(
          { length: setsInScheme(CONDITIONING.find((m) => m.id === id)?.scheme ?? '') },
          () => ({ weight: 0, reps: 1 }),
        ),
      })),
    }
    await saveSession(session)
    void pushSession(session)
    setSelected(new Set())
    await onLogged()
  }

  return (
    <>
      <h1 className="screen-title">Condition</h1>
      <p className="screen-sub">
        Explosive strength and a bulletproof trunk — the base your lifts stand on.
      </p>

      <div className="seg" role="radiogroup" aria-label="Filter movements">
        {(['all', 'power', 'core', 'spine'] as Filter[]).map((f) => (
          <button key={f} role="radio" aria-checked={filter === f}
            className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : PURPOSE_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="card" style={{ paddingTop: 'var(--s1)', paddingBottom: 'var(--s1)' }}>
        {moves.map((m) => {
          const since = daysSince(lastDone.get(m.id), now)
          const isOn = selected.has(m.id)
          return (
            <div className="stretch-row cond-row" key={m.id} onClick={() => toggle(m.id)}
              role="checkbox" aria-checked={isOn} tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(m.id)
                }
              }}>
              <span className="check" aria-hidden="true"><CheckIcon /></span>
              <div>
                <div className="top">
                  <span className="name">{m.name}</span>
                  <span className="scheme num">{m.scheme}</span>
                </div>
                <div className="cue">{m.cue}</div>
                <div className="cond-meta">
                  {m.purpose.map((p) => <span className="tag" key={p}>{PURPOSE_LABEL[p]}</span>)}
                  {since !== null && (
                    <span className="cond-done">
                      Done {since === 0 ? 'today' : `${since}d ago`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {selected.size > 0 && (
        <>
          <div style={{ height: 'var(--s5)' }} />
          <button className="btn-primary" onClick={logSelected}>
            Log {selected.size} movement{selected.size > 1 ? 's' : ''} done
          </button>
        </>
      )}
    </>
  )
}
