import type { Session } from '../types'

export interface RemoteMeta {
  uuid: string
  updatedAt: number
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
 * Reconcile local and remote by write time: push any local copy the cloud is
 * missing or has an older version of, pull any remote copy that's newer than
 * (or absent from) local. Tombstones are ordinary sessions here — a deletion
 * is just a newer write, so it flows in whichever direction is stale.
 */
export function planSessionSync(
  local: Session[],
  remote: RemoteMeta[],
): { toPush: Session[]; toPullUuids: string[] } {
  const remoteStamp = new Map(remote.map((r) => [r.uuid, r.updatedAt ?? 0]))
  const localStamp = new Map(local.map((s) => [s.uuid, syncStamp(s)]))
  return {
    toPush: local.filter((s) => {
      const r = remoteStamp.get(s.uuid)
      return r === undefined || syncStamp(s) > r
    }),
    toPullUuids: remote
      .filter((r) => {
        const l = localStamp.get(r.uuid)
        return l === undefined || (r.updatedAt ?? 0) > l
      })
      .map((r) => r.uuid),
  }
}
