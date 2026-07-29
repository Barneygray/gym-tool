import { useState } from 'react'
import type { EquipmentProfile, Settings } from '../../types'
import {
  PLATE_PRESETS, activeProfile, makeProfile, parsePlates, profilesOf,
} from '../../engine/equipment'
import { TrashIcon } from '../../components/Icons'
import { SetupPage, type UpdateSettings } from './shared'

export function EquipmentPage({ settings, update, onBack }: {
  settings: Settings
  update: UpdateSettings
  onBack: () => void
}) {
  return (
    <SetupPage
      title="Equipment"
      blurb="What’s actually on the rack where you train. Every weight the coach suggests is rounded to something you can load here."
      onBack={onBack}
    >
      <Gyms settings={settings} update={update} />
    </SetupPage>
  )
}

/**
 * Bar weight and plates aren't a preference, they're a description of the room
 * you're standing in: they decide what `roundToLoadable` will ever suggest and
 * what the plate hint shows. A single global pair only ever describes one gym,
 * so travelling — or having a rack at home as well — silently produced target
 * weights that couldn't be loaded.
 */
function Gyms({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const profiles = profilesOf(settings)
  const active = activeProfile(settings)
  const [platesText, setPlatesText] = useState(active.platesKg.join(', '))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  /** Write a profile back, keeping the mirrored flat fields in step. */
  const writeProfile = (next: EquipmentProfile) => {
    const list = profiles.map((p) => (p.id === next.id ? next : p))
    return update({
      profiles: list,
      activeProfileId: next.id,
      ...(next.id === settings.activeProfileId || profiles.length === 1
        ? { barWeightKg: next.barWeightKg, platesKg: next.platesKg }
        : {}),
    })
  }

  const switchTo = (id: string) => {
    const target = profiles.find((p) => p.id === id)
    if (!target) return
    setPlatesText(target.platesKg.join(', '))
    return update({
      profiles,
      activeProfileId: id,
      barWeightKg: target.barWeightKg,
      platesKg: target.platesKg,
    })
  }

  const savePlates = () => {
    const plates = parsePlates(platesText)
    if (plates.length === 0) return
    setPlatesText(plates.join(', '))
    return writeProfile({ ...active, platesKg: plates })
  }

  const addGym = async () => {
    const name = newName.trim()
    if (!name) return
    const created = makeProfile({ name, barWeightKg: active.barWeightKg, platesKg: active.platesKg })
    setNewName('')
    setEditingId(null)
    setPlatesText(created.platesKg.join(', '))
    await update({
      profiles: [...profiles, created],
      activeProfileId: created.id,
      barWeightKg: created.barWeightKg,
      platesKg: created.platesKg,
    })
  }

  const removeGym = async (id: string) => {
    if (profiles.length <= 1) return
    if (!window.confirm('Delete this gym? Sessions logged there are kept.')) return
    const list = profiles.filter((p) => p.id !== id)
    const next = list[0]
    setPlatesText(next.platesKg.join(', '))
    await update({
      profiles: list,
      activeProfileId: next.id,
      barWeightKg: next.barWeightKg,
      platesKg: next.platesKg,
    })
  }

  return (
    <>
      {profiles.length > 1 && (
        <>
          <div className="section-label">Training at</div>
          <div className="card pane">
            <div className="settings-row stack">
              <div className="sub">
                Switch gyms and every suggestion re-rounds to what’s on the rack.
              </div>
              <div className="gym-list">
                {profiles.map((p) => (
                  <div className="gym-row" key={p.id}>
                    <button className={`gym-pick${p.id === active.id ? ' on' : ''}`}
                      role="radio" aria-checked={p.id === active.id} onClick={() => switchTo(p.id)}>
                      <span className="gname">{p.name}</span>
                      <span className="gdetail num">{p.barWeightKg} kg bar · {p.platesKg.join(', ')}</span>
                    </button>
                    <button className="set-del" aria-label={`Delete ${p.name}`} onClick={() => removeGym(p.id)}>
                      <TrashIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section-label">
        {profiles.length > 1 ? `Bar and plates — ${active.name}` : 'Bar and plates'}
      </div>
      <div className="card pane">
        <div className="settings-row">
          <div>
            <div className="k">Bar weight</div>
            <div className="sub">Used for plate math and warm-ups</div>
          </div>
          <input type="number" inputMode="decimal" value={active.barWeightKg}
            onChange={(e) => writeProfile({ ...active, barWeightKg: Number(e.target.value) || 20 })} />
        </div>

        <div className="settings-row stack">
          <div>
            <div className="k">Plates available (kg, per side)</div>
            <div className="sub">Comma separated — determines every loadable weight</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
            <input style={{ flex: 1, minWidth: 0 }} value={platesText}
              onChange={(e) => setPlatesText(e.target.value)} onBlur={savePlates} />
            <button className="btn-small accent" onClick={savePlates}>Save</button>
          </div>
          {/* Presets wrap as chips. Stacked full-width bars made four shortcuts
              look like four primary actions. */}
          <div className="chip-row" style={{ marginTop: 'var(--s3)' }}>
            {PLATE_PRESETS.map((preset) => (
              <button key={preset.name} className="btn-small"
                onClick={() => {
                  setPlatesText(preset.platesKg.join(', '))
                  void writeProfile({ ...active, barWeightKg: preset.barWeightKg, platesKg: preset.platesKg })
                }}>
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-label">Another gym</div>
      <div className="card pane">
        {editingId === 'new' ? (
          <div style={{ display: 'flex', gap: 'var(--s2)', paddingTop: 'var(--s3)' }}>
            <input style={{ flex: 1, minWidth: 0 }} autoFocus placeholder="Gym name — e.g. Hotel gym"
              value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-small accent" onClick={addGym} disabled={!newName.trim()}>Add</button>
            <button className="btn-small" onClick={() => { setEditingId(null); setNewName('') }}>Cancel</button>
          </div>
        ) : (
          <>
            <p className="sub" style={{ marginBottom: 'var(--s3)' }}>
              Training somewhere else — a hotel rack, a garage bar — starts from a copy of this
              gym’s kit. Switch between them and the plate math follows.
            </p>
            <button className="btn-small" onClick={() => setEditingId('new')}>+ Another gym</button>
          </>
        )}
      </div>
    </>
  )
}
