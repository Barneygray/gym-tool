import type { ReactNode } from 'react'
import type { Equipment, Muscle, Settings } from '../../types'
import { BackIcon } from '../../components/Icons'

/** Every setup page writes settings the same way: patch, save, push, refresh. */
export type UpdateSettings = (patch: Partial<Settings>) => Promise<void>

export const MUSCLES: Muscle[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core',
]
export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}
export const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell']
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine',
  bodyweight: 'Bodyweight', kettlebell: 'Kettlebell',
}

/**
 * The frame every setup page shares: a back arrow to the index, the page's
 * title, and one line saying what the page is for. Settings used to be one
 * scroll of eleven ruled sections, which meant the plate list and the button
 * that wipes your history sat in the same undifferentiated column.
 */
export function SetupPage({ title, blurb, onBack, children }: {
  title: string
  blurb: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <>
      <div className="setup-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to Setup">
          <BackIcon />
        </button>
        <h1 className="screen-title">{title}</h1>
      </div>
      <p className="screen-sub">{blurb}</p>
      {children}
    </>
  )
}
