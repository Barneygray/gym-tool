import type { Session } from '../types'

/**
 * Sessions are append-only (never edited after being logged), so reconciling
 * local and remote is a plain existence check: anything missing on one side
 * gets copied from the other. No conflict resolution needed.
 */
export function planSessionSync(
  local: Session[],
  remoteUuids: string[],
): { toPush: Session[]; toPullUuids: string[] } {
  const localUuids = new Set(local.map((s) => s.uuid))
  const remoteSet = new Set(remoteUuids)
  return {
    toPush: local.filter((s) => !remoteSet.has(s.uuid)),
    toPullUuids: remoteUuids.filter((u) => !localUuids.has(u)),
  }
}
