/** Greedy per-side plate breakdown. Returns null when the weight can't be loaded exactly. */
export function platesPerSide(
  totalKg: number,
  barKg: number,
  availableKg: number[],
): number[] | null {
  if (totalKg < barKg) return null
  let perSide = (totalKg - barKg) / 2
  const plates = [...availableKg].sort((a, b) => b - a)
  const out: number[] = []
  for (const p of plates) {
    while (perSide >= p - 1e-9) {
      out.push(p)
      perSide -= p
    }
  }
  return Math.abs(perSide) < 1e-9 ? out : null
}

/**
 * The smallest weight change a bar and this plate set can express — a pair of
 * the smallest plates. It's the floor on any real increase: a gym that owns
 * nothing under 5s cannot add 2.5 kg to a bar, however much the maths wants to.
 */
export function loadableStep(availableKg: number[]): number {
  const step = Math.min(...availableKg) * 2
  return Number.isFinite(step) && step > 0 ? step : 0
}

/** Round a weight down to the nearest bar-loadable value. */
export function roundToLoadable(totalKg: number, barKg: number, availableKg: number[]): number {
  const step = loadableStep(availableKg) || 2.5
  if (totalKg <= barKg) return barKg
  return barKg + Math.floor((totalKg - barKg) / step + 1e-9) * step
}

/** Round to the nearest sensible non-barbell increment (dumbbells, stacks). */
export function roundToStep(kg: number, step: number): number {
  return Math.round(kg / step) * step
}
