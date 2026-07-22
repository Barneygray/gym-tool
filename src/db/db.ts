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

/** All finished sessions, newest first. */
export async function getHistory(): Promise<Session[]> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray()
  return all.filter((s) => s.finishedAt !== undefined)
}

export async function saveSession(session: Session): Promise<number> {
  const withUuid = session.uuid ? session : { ...session, uuid: crypto.randomUUID() }
  return db.sessions.put(withUuid)
}

/** Every locally stored session, including any never finished. */
export async function getAllSessions(): Promise<Session[]> {
  return db.sessions.toArray()
}

/** Insert sessions pulled from the cloud that aren't present locally yet (matched by uuid). */
export async function mergeRemoteSessions(remote: Session[]): Promise<void> {
  if (remote.length === 0) return
  await db.transaction('rw', db.sessions, async () => {
    const existing = new Set((await db.sessions.toArray()).map((s) => s.uuid))
    const toAdd = remote.filter((s) => !existing.has(s.uuid)).map(({ id: _id, ...rest }) => rest as Session)
    if (toAdd.length > 0) await db.sessions.bulkAdd(toAdd)
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
