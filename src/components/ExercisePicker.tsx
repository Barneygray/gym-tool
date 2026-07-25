import { useState } from 'react'
import type { Muscle } from '../types'
import { EXERCISES } from '../data/exercises'

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Delts', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hams', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}

interface ExercisePickerProps {
  /** Ids already in the workout — filtered out of the options. */
  existing: string[]
  onPick: (id: string) => void
  onCancel: () => void
  placeholder?: string
  /** Optional shortlist shown first, e.g. like-for-like swap candidates. */
  suggested?: string[]
  suggestedLabel?: string
  autoFocus?: boolean
}

/**
 * Searchable exercise list over the live catalog — custom lifts included, since
 * they're registered into `EXERCISES` on load. Shared by the workout preview,
 * the in-session add/swap flows, and the program builder.
 */
export function ExercisePicker({
  existing, onPick, onCancel, placeholder = 'Search exercises…', suggested = [],
  suggestedLabel = 'Like for like', autoFocus = true,
}: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const taken = new Set(existing)
  const q = query.trim().toLowerCase()

  const matches = (name: string) => q === '' || name.toLowerCase().includes(q)
  const shortlist = suggested
    .filter((id) => !taken.has(id))
    .map((id) => EXERCISES.find((e) => e.id === id))
    .filter((e): e is (typeof EXERCISES)[number] => e !== undefined && matches(e.name))
  const shortlistIds = new Set(shortlist.map((e) => e.id))
  const rest = EXERCISES
    .filter((e) => !taken.has(e.id) && !shortlistIds.has(e.id) && matches(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="add-picker">
      <div className="add-picker-head">
        <input autoFocus={autoFocus} placeholder={placeholder} value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-small" onClick={onCancel}>Done</button>
      </div>
      <div className="add-picker-list">
        {shortlist.length === 0 && rest.length === 0 && (
          <div className="add-picker-empty">No matches.</div>
        )}
        {shortlist.length > 0 && (
          <>
            <div className="add-picker-group">{suggestedLabel}</div>
            {shortlist.map((e) => (
              <button key={e.id} className="add-picker-row" onClick={() => onPick(e.id)}>
                <span className="name">{e.name}</span>
                <span className="muscle-tag">{MUSCLE_LABEL[e.primary]}</span>
              </button>
            ))}
            {rest.length > 0 && <div className="add-picker-group">Everything else</div>}
          </>
        )}
        {rest.map((e) => (
          <button key={e.id} className="add-picker-row" onClick={() => onPick(e.id)}>
            <span className="name">{e.name}</span>
            <span className="muscle-tag">{MUSCLE_LABEL[e.primary]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
