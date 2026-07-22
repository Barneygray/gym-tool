import { useState } from 'react'
import { STRETCH_GROUPS, DESK_RESCUE, type StretchGroup } from '../data/stretches'

export function StretchScreen() {
  const [mode, setMode] = useState<'muscles' | 'desk'>('muscles')
  const groups = mode === 'muscles' ? STRETCH_GROUPS : DESK_RESCUE

  return (
    <>
      <h1 className="screen-title">Stretch</h1>
      <p className="screen-sub">
        {mode === 'muscles'
          ? 'Key holds for every muscle group — best after training, when warm.'
          : 'The antidote to sitting all day: back, neck and hips, daily.'}
      </p>

      <div className="seg">
        <button className={mode === 'muscles' ? 'on' : ''} onClick={() => setMode('muscles')}>
          By muscle
        </button>
        <button className={mode === 'desk' ? 'on' : ''} onClick={() => setMode('desk')}>
          Desk rescue
        </button>
      </div>

      {groups.map((g) => <GroupBlock key={g.id} group={g} />)}
    </>
  )
}

function GroupBlock({ group }: { group: StretchGroup }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="section-label">{group.name}</div>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {group.stretches.map((s) => (
          <div className="stretch-row" key={s.id}>
            <div className="top">
              <span className="name">{s.name}</span>
              <span className="hold num">{s.holdSec}s{s.perSide ? ' / side' : ''}</span>
            </div>
            <div className="targets">{s.targets}</div>
            <div className="cue">{s.cue}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
