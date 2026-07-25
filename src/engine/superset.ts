/**
 * Superset grouping for the workout preview. Exercises are laid out in order;
 * an id present in `joined` is trained together with the exercise directly above
 * it. Consecutive joined ids collapse into one group. Only groups of 2+ count as
 * supersets — a lone exercise is just a normal station.
 */
export function buildSupersets(exerciseIds: string[], joined: Set<string>): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  for (const id of exerciseIds) {
    if (current.length > 0 && joined.has(id)) current.push(id)
    else {
      if (current.length > 1) groups.push(current)
      current = [id]
    }
  }
  if (current.length > 1) groups.push(current)
  return groups
}

/**
 * The next partner to alternate to within a superset: the group member other
 * than `currentId` with the fewest sets logged so far (ties break to group
 * order). Returns null if the exercise isn't in a multi-exercise group.
 */
export function nextPartner(
  group: string[] | null | undefined,
  currentId: string,
  setCounts: Record<string, { length: number } | undefined>,
): string | null {
  if (!group) return null
  const others = group.filter((id) => id !== currentId)
  if (others.length === 0) return null
  return [...others].sort(
    (a, b) => (setCounts[a]?.length ?? 0) - (setCounts[b]?.length ?? 0),
  )[0]
}
