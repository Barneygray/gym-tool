import { describe, it, expect, afterEach } from 'vitest'
import {
  BUILTIN_EXERCISES, EXERCISES, getExercise, loadBasisHint, loadBasisOf, loadBasisTag,
  makeCustomExercise, registerCustomExercises,
} from '../data/exercises'
import { CONDITIONING_EXERCISES } from '../data/conditioning'

/** Custom exercises are global state; every test that registers must clean up. */
afterEach(() => registerCustomExercises([]))

describe('load basis — what a dumbbell weight refers to', () => {
  it('treats hand-held lifts as per-hand unless told otherwise', () => {
    expect(loadBasisOf(getExercise('db-bench-press'))).toBe('per-hand')
    expect(loadBasisOf(getExercise('lateral-raise'))).toBe('per-hand')
    expect(loadBasisOf(getExercise('bulgarian-split-squat'))).toBe('per-hand')
  })

  it('marks the lifts where only one bell is in play', () => {
    // One arm at a time, and two hands under a single bell.
    expect(loadBasisOf(getExercise('db-row'))).toBe('single')
    expect(loadBasisOf(getExercise('db-overhead-ext'))).toBe('single')
  })

  it('has nothing to say about bars, cables, machines or bodyweight', () => {
    for (const id of ['bench-press', 'lat-pulldown', 'leg-press', 'pull-up']) {
      expect(loadBasisOf(getExercise(id))).toBeNull()
      expect(loadBasisTag(getExercise(id))).toBeNull()
      expect(loadBasisHint(getExercise(id))).toBeNull()
    }
  })

  it('stays quiet on conditioning, which is logged as work done, not at a load', () => {
    for (const move of CONDITIONING_EXERCISES) {
      expect(loadBasisOf(move)).toBeNull()
    }
  })

  it('labels each basis distinctly, naming the implement', () => {
    expect(loadBasisTag(getExercise('db-bench-press'))).toBe('per hand')
    expect(loadBasisTag(getExercise('db-row'))).toBe('one dumbbell')
    expect(loadBasisHint(getExercise('db-bench-press'))).toContain('not the pair')
    expect(loadBasisHint(getExercise('db-row'))).toContain('Single dumbbell')
  })

  it('does not stamp a basis on lifts that have no hands-on ambiguity', () => {
    for (const e of BUILTIN_EXERCISES) {
      if (e.equipment === 'dumbbell' || e.equipment === 'kettlebell') continue
      expect(e.loadBasis).toBeUndefined()
    }
  })
})

describe('custom exercises declare their own basis', () => {
  const custom = (name: string, input: Partial<Parameters<typeof makeCustomExercise>[0]> = {}) =>
    makeCustomExercise({ name, primary: 'chest', equipment: 'dumbbell', ...input })

  it('defaults a hand-held custom lift to per-hand without storing the field', () => {
    const e = custom('Flat DB Press', { loadBasis: 'per-hand' })
    expect(e.loadBasis).toBeUndefined()
    expect(loadBasisOf(e)).toBe('per-hand')
  })

  it('records a single-bell custom lift', () => {
    const e = custom('Goblet Squat', { primary: 'quads', loadBasis: 'single' })
    expect(e.loadBasis).toBe('single')
    expect(loadBasisTag(e)).toBe('one dumbbell')
  })

  it('ignores the basis on equipment where it means nothing', () => {
    const e = custom('Pin Press', { equipment: 'barbell', loadBasis: 'single' })
    expect(e.loadBasis).toBeUndefined()
    expect(loadBasisOf(e)).toBeNull()
  })

  it('names kettlebells as kettlebells', () => {
    const e = custom('KB Front Rack Squat', { primary: 'quads', equipment: 'kettlebell', loadBasis: 'single' })
    expect(loadBasisTag(e)).toBe('one kettlebell')
    expect(loadBasisHint(e)).toContain('kettlebell')
  })

  it('survives registration into the live catalog', () => {
    const e = custom('Suitcase Deadlift', { primary: 'back', loadBasis: 'single' })
    registerCustomExercises([e])
    expect(loadBasisOf(EXERCISES.find((x) => x.id === e.id)!)).toBe('single')
  })
})
