import Dexie, { type Table } from 'dexie'
import type { BodyLog, Exercise, Session, Settings } from '../types'
import { registerCustomExercises } from '../data/exercises'

export class ForgeDB extends Dexie {
  sessions!: Table<Session, number>
  settings!: Table<Settings, string>
  /** User-defined exercises, merged with the built-in catalog at load time. */
  exercises!: Table<Exercise, string>
  /** Bodyweight readings, one row per day (keyed by start-of-day epoch). */
  bodyweights!: Table<BodyLog, number>

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
    this.version(3).stores({
      sessions: '++id, uuid, dayType, startedAt',
      settings: 'id',
      exercises: 'id',
      bodyweights: 'at',
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

// ── Custom exercises ────────────────────────────────────
/** Read the user's custom exercises and merge them into the live catalog. */
export async function loadCustomExercises(): Promise<Exercise[]> {
  const custom = await db.exercises.toArray()
  registerCustomExercises(custom)
  return custom
}

/** Read the custom exercises without re-registering (for management UIs). */
export async function getCustomExercises(): Promise<Exercise[]> {
  return db.exercises.toArray()
}

export async function saveCustomExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise)
  await loadCustomExercises()
}

export async function deleteCustomExercise(id: string): Promise<void> {
  await db.exercises.delete(id)
  await loadCustomExercises()
}

// ── Bodyweight log ──────────────────────────────────────
/** Start-of-day epoch for a timestamp, so there's one bodyweight row per day. */
export function dayKey(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** All bodyweight readings, oldest first. */
export async function getBodyLog(): Promise<BodyLog[]> {
  return db.bodyweights.orderBy('at').toArray()
}

export async function saveBodyweight(kg: number, at: number = Date.now()): Promise<void> {
  await db.bodyweights.put({ at: dayKey(at), kg })
}

export async function deleteBodyweight(at: number): Promise<void> {
  await db.bodyweights.delete(at)
}

export async function exportData(): Promise<string> {
  const sessions = await db.sessions.toArray()
  const settings = await getSettings()
  const exercises = await db.exercises.toArray()
  const bodyweights = await db.bodyweights.toArray()
  return JSON.stringify({ version: 2, exportedAt: Date.now(), sessions, settings, exercises, bodyweights }, null, 2)
}

export async function importData(json: string): Promise<number> {
  const parsed = JSON.parse(json) as {
    sessions?: Session[]
    settings?: Settings
    exercises?: Exercise[]
    bodyweights?: BodyLog[]
  }
  if (!Array.isArray(parsed.sessions)) throw new Error('Invalid backup file')
  await db.transaction('rw', db.sessions, db.settings, db.exercises, db.bodyweights, async () => {
    await db.sessions.clear()
    await db.sessions.bulkAdd(
      parsed.sessions!.map(({ id: _id, ...rest }) => ({ ...rest, uuid: rest.uuid ?? crypto.randomUUID() }) as Session),
    )
    if (parsed.settings) await db.settings.put({ ...parsed.settings, id: 'main' })
    if (Array.isArray(parsed.exercises)) {
      await db.exercises.clear()
      await db.exercises.bulkAdd(parsed.exercises)
    }
    if (Array.isArray(parsed.bodyweights)) {
      await db.bodyweights.clear()
      await db.bodyweights.bulkAdd(parsed.bodyweights)
    }
  })
  await loadCustomExercises()
  return parsed.sessions.length
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.settings, db.exercises, db.bodyweights, async () => {
    await db.sessions.clear()
    await db.settings.clear()
    await db.exercises.clear()
    await db.bodyweights.clear()
  })
  await loadCustomExercises()
}
