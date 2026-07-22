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

/** Round a weight down to the nearest bar-loadable value. */
export function roundToLoadable(totalKg: number, barKg: number, availableKg: number[]): number {
  const step = Math.min(...availableKg) * 2
  if (totalKg <= barKg) return barKg
  return barKg + Math.floor((totalKg - barKg) / step + 1e-9) * step
}

/** Round to the nearest sensible non-barbell increment (dumbbells, stacks). */
export function roundToStep(kg: number, step: number): number {
  return Math.round(kg / step) * step
}
