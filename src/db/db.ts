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
  return db.sessions.put(session)
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
    await db.sessions.bulkAdd(parsed.sessions!.map(({ id: _id, ...rest }) => rest as Session))
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
