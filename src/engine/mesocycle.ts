import type { MesoConfig } from '../types'

const WEEK = 7 * 86_400_000

export type MesoPhaseKind = 'accumulation' | 'deload'

export interface MesoPhase {
  /** 1-based week within the current cycle. */
  week: number
  /** Total weeks in the cycle (deload included). */
  weeks: number
  phase: MesoPhaseKind
  /**
   * Extra working sets to add this week. Accumulation ramps 0,1,2,… across the
   * block; the deload week carries a negative bias so volume actually drops.
   */
  setBias: number
  /** Weight multiplier — 1 while accumulating, backed off on the deload week. */
  intensity: number
  /** Short banner label, e.g. "Week 2 / 4 · Accumulation". */
  label: string
  /** One-line coaching note for the week. */
  note: string
}

/** Sanitised block length: at least 3 weeks (2 accumulation + 1 deload). */
export function mesoWeeks(config: MesoConfig): number {
  return Math.max(3, Math.round(config.weeks))
}

/**
 * Where `now` falls inside the repeating block. Cycles wrap automatically, so a
 * block set weeks ago keeps rolling accumulation → deload → accumulation without
 * any explicit "start next block" step.
 */
export function currentPhase(config: MesoConfig, now: number): MesoPhase {
  const weeks = mesoWeeks(config)
  const elapsed = Math.max(0, Math.floor((now - config.startAt) / WEEK))
  const pos = elapsed % weeks // 0-based week within the cycle
  const week = pos + 1
  const isDeload = week === weeks

  if (isDeload) {
    return {
      week,
      weeks,
      phase: 'deload',
      setBias: -1,
      intensity: 0.6,
      label: `Week ${week} / ${weeks} · Deload`,
      note: 'Planned deload — drop the load, cut a set, let fatigue clear before the next block.',
    }
  }

  // Accumulation weeks ramp added volume: week 1 baseline, then +1 set each week
  // up to the last accumulation week.
  const setBias = Math.min(pos, weeks - 2)
  return {
    week,
    weeks,
    phase: 'accumulation',
    setBias,
    intensity: 1,
    label: `Week ${week} / ${weeks} · Accumulation`,
    note:
      setBias === 0
        ? 'Block start — establish your working weights, leave a rep in the tank.'
        : `Volume ramp — add sets and push reps. ${weeks - 1 - pos} week${weeks - 1 - pos === 1 ? '' : 's'} to the deload.`,
  }
}

/** The active phase, or null when no block is configured. */
export function phaseFor(config: MesoConfig | null | undefined, now: number): MesoPhase | null {
  if (!config) return null
  return currentPhase(config, now)
}
