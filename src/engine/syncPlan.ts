import type { Session, SyncMeta } from '../types'

export interface RemoteMeta {
  uuid: string
  updatedAt: number
}

/** Anything reconcilable: a stable key plus the time it was last written. */
export interface SyncCandidate {
  key: string
  stamp: number
}

/**
 * The write timestamp used to compare two copies of a session. Sessions logged
 * before edit/delete tracking existed fall back to their finish (or start)
 * time, so they compare equal on both sides and neither wins spuriously.
 */
export function syncStamp(s: Pick<Session, 'updatedAt' | 'finishedAt' | 'startedAt'>): number {
  return s.updatedAt ?? s.finishedAt ?? s.startedAt
}

/**
 * The write timestamp for a non-session record. Rows written before sync
 * tracking existed have no stamp at all; 0 is the right answer — it loses every
 * comparison, but a record the cloud has never seen is still pushed, because
 * "remote is missing it" is checked before any stamps are compared.
 */
export function recordStamp(r: SyncMeta): number {
  return r.updatedAt ?? 0
}

/**
 * Reconcile two sides by write time: push any local copy the other side is
 * missing or holds an older version of, pull any remote copy newer than (or
 * absent from) local. Tombstones need no special case — a deletion is just a
 * newer write, so it flows in whichever direction is stale.
 */
export function planSync(
  local: SyncCandidate[],
  remote: SyncCandidate[],
): { pushKeys: string[]; pullKeys: string[] } {
  const remoteStamp = new Map(remote.map((r) => [r.key, r.stamp]))
  const localStamp = new Map(local.map((l) => [l.key, l.stamp]))
  return {
    pushKeys: local
      .filter((l) => {
        const r = remoteStamp.get(l.key)
        return r === undefined || l.stamp > r
      })
      .map((l) => l.key),
    pullKeys: remote
      .filter((r) => {
        const l = localStamp.get(r.key)
        return l === undefined || r.stamp > l
      })
      .map((r) => r.key),
  }
}

/** `planSync` specialised to sessions, which key on `uuid`. */
export function planSessionSync(
  local: Session[],
  remote: RemoteMeta[],
): { toPush: Session[]; toPullUuids: string[] } {
  const byUuid = new Map(local.map((s) => [s.uuid, s]))
  const { pushKeys, pullKeys } = planSync(
    local.map((s) => ({ key: s.uuid, stamp: syncStamp(s) })),
    remote.map((r) => ({ key: r.uuid, stamp: r.updatedAt ?? 0 })),
  )
  return {
    toPush: pushKeys.map((k) => byUuid.get(k)).filter((s): s is Session => s !== undefined),
    toPullUuids: pullKeys,
  }
}
