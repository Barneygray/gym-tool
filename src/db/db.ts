import Dexie, { type Table } from 'dexie'
import type { Session, Settings } from '../types'

export class ForgeDB extends Dexie {
  sessions!: Table<Session, number>
  settings!: Table<Settings, string>

  constructor() {
    super('forge')
    this.version(1).stores({
      sessions: '++id, dayType, startedAt',
      settings: 'id',
    })
    this.version(2)
      .stores({
        sessions: '++id, uuid, dayType, startedAt',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('sessions')
          .toCollection()
          .modify((s: Session) => {
            if (!s.uuid) s.uuid = crypto.randomUUID()
          })
      })
  }
}

export const db = new ForgeDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  barWeightKg: 20,
  platesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  soundOn: true,
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.settings.put(s)
}

/** All finished, non-deleted sessions, newest first. */
export async function getHistory(): Promise<Session[]> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray()
  return all.filter((s) => s.finishedAt !== undefined && s.deletedAt === undefined)
}

export async function saveSession(session: Session): Promise<number> {
  const withUuid = session.uuid ? session : { ...session, uuid: crypto.randomUUID() }
  return db.sessions.put({ ...withUuid, updatedAt: Date.now() })
}

/**
 * Persist edits to an existing session as given. The caller stamps `updatedAt`
 * so the exact same value can be pushed to the cloud — keeping local and remote
 * write times identical and avoiding a spurious re-push on the next sync.
 */
export async function updateSession(session: Session): Promise<number> {
  return db.sessions.put(session)
}

/**
 * Soft-delete by uuid: write a tombstone rather than dropping the row, so the
 * deletion propagates to the cloud and other devices instead of resurrecting.
 * Returns the tombstoned session so the caller can push the same stamp.
 */
export async function deleteSession(uuid: string): Promise<Session | undefined> {
  const now = Date.now()
  const existing = await db.sessions.where('uuid').equals(uuid).first()
  if (!existing) return undefined
  const tombstoned: Session = { ...existing, deletedAt: now, updatedAt: now }
  await db.sessions.put(tombstoned)
  return tombstoned
}

/** Every locally stored session, including tombstones — used by sync. */
export async function getAllSessions(): Promise<Session[]> {
  return db.sessions.toArray()
}

/**
 * Apply sessions pulled from the cloud, overwriting the local copy by uuid.
 * Handles new sessions, edits, and tombstones alike — the caller only passes
 * rows the sync planner judged newer than what's local.
 */
export async function applyRemoteSessions(remote: Session[]): Promise<void> {
  if (remote.length === 0) return
  await db.transaction('rw', db.sessions, async () => {
    const idByUuid = new Map((await db.sessions.toArray()).map((s) => [s.uuid, s.id]))
    for (const r of remote) {
      const { id: _id, ...rest } = r
      const existingId = idByUuid.get(r.uuid)
      if (existingId !== undefined) await db.sessions.put({ ...rest, id: existingId })
      else await db.sessions.add(rest as Session)
    }
  })
}

export async function exportData(): Promise<string> {
  const sessions = await db.sessions.toArray()
  const settings = await getSettings()
  return JSON.stringify({ version: 1, exportedAt: Date.now(), sessions, settings }, null, 2)
}

export async function importData(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { sessions?: Session[]; settings?: Settings }
  if (!Array.isArray(parsed.sessions)) throw new Error('Invalid backup file')
  await db.transaction('rw', db.sessions, db.settings, async () => {
    await db.sessions.clear()
    await db.sessions.bulkAdd(
      parsed.sessions!.map(({ id: _id, ...rest }) => ({ ...rest, uuid: rest.uuid ?? crypto.randomUUID() }) as Session),
    )
    if (parsed.settings) await db.settings.put({ ...parsed.settings, id: 'main' })
  })
  return parsed.sessions.length
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.settings, async () => {
    await db.sessions.clear()
    await db.settings.clear()
  })
}
