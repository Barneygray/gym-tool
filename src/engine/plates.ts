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

/**
 * Round down to a weight the equipment can actually be set to, for everything
 * that isn't bar-loaded: dumbbells off a rack, a pin in a stack, a fixed-step
 * machine. `step` is the smallest change the implement allows, so every rung is
 * a whole number of steps from empty — 1 kg dumbbells give 18, 19, 20, never the
 * 18.5 no rack in the building holds.
 *
 * Down, not nearest, for the same reason the barbell rounds down: a prescription
 * you can't load is worse than a slightly conservative one, and a jump that
 * shrinks below a single step should land back on the weight you're already
 * lifting so the caller can see it earned nothing.
 */
export function roundToStep(kg: number, step: number): number {
  if (!(step > 0)) return Math.max(kg, 0)
  const rungs = Math.floor(kg / step + 1e-9)
  // Multiplying back can land a hair off a value the UI then prints as 17.500000000000004.
  return Math.max(Math.round(rungs * step * 1000) / 1000, 0)
}
