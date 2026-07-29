import Dexie, { type Table } from 'dexie'
import type { BodyLog, DayTemplate, Exercise, Goal, Session, Settings, SyncMeta } from '../types'
import { registerCustomExercises } from '../data/exercises'
import { registerCustomDays } from '../data/days'

/** A stashed copy of everything, written just before a restore overwrites it. */
export interface Snapshot {
  id: string
  at: number
  json: string
}

export class ForgeDB extends Dexie {
  sessions!: Table<Session, number>
  settings!: Table<Settings, string>
  /** User-defined exercises, merged with the built-in catalog at load time. */
  exercises!: Table<Exercise, string>
  /** Bodyweight readings, one row per day (keyed by start-of-day epoch). */
  bodyweights!: Table<BodyLog, number>
  /** User-built gym days, merged with the built-in split at load time. */
  days!: Table<DayTemplate, string>
  /** Strength goals with e1RM targets. */
  goals!: Table<Goal, string>
  /** Undo buffer for restores — one row, replaced on each import. */
  snapshots!: Table<Snapshot, string>

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
    this.version(4).stores({
      sessions: '++id, uuid, dayType, startedAt',
      settings: 'id',
      exercises: 'id',
      bodyweights: 'at',
      days: 'id',
      goals: 'id, createdAt',
    })
    // v5 adds the restore-undo buffer. Exercises, days, goals and bodyweights
    // also gain `updatedAt`/`deletedAt` so they sync the way sessions do; those
    // are unindexed fields, so they need no migration — a missing stamp reads as
    // "the cloud has never seen this", which pushes the row on the next sync.
    this.version(5).stores({
      sessions: '++id, uuid, dayType, startedAt',
      settings: 'id',
      exercises: 'id',
      bodyweights: 'at',
      days: 'id',
      goals: 'id, createdAt',
      snapshots: 'id',
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

/** Drops tombstoned rows — they stay on disk so the deletion still syncs. */
const live = <T extends SyncMeta>(rows: T[]): T[] => rows.filter((r) => r.deletedAt === undefined)

/** Stamp a write so last-write-wins sync can order it. */
function stamp<T extends SyncMeta>(row: T): T {
  return { ...row, updatedAt: Date.now(), deletedAt: undefined }
}

/** Tombstone a row in place, returning it so the caller can push the same stamp. */
function tombstone<T extends SyncMeta>(row: T): T {
  const now = Date.now()
  return { ...row, deletedAt: now, updatedAt: now }
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(s: Settings): Promise<Settings> {
  const next = { ...stamp(s), id: 'main' }
  await db.settings.put(next)
  return next
}

/** Persist settings exactly as given — used when applying a newer cloud copy. */
export async function putSettings(s: Settings): Promise<void> {
  await db.settings.put({ ...s, id: 'main' })
}

/** All finished, non-deleted sessions, newest first. */
export async function getHistory(): Promise<Session[]> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray()
  return all.filter((s) => s.finishedAt !== undefined && s.deletedAt === undefined)
}

/**
 * Write a session, reusing the row a session with the same uuid already
 * occupies. Resuming a finished session re-saves it under its original
 * identity, and without reusing the auto-increment key Dexie would file the
 * same workout a second time. Returns the stamped row so the caller pushes
 * exactly what was stored, keeping local and remote write times identical.
 */
export async function saveSession(session: Session): Promise<Session> {
  const withUuid = session.uuid ? session : { ...session, uuid: crypto.randomUUID() }
  const existing = await db.sessions.where('uuid').equals(withUuid.uuid).first()
  const next: Session = { ...withUuid, updatedAt: Date.now() }
  if (existing?.id !== undefined) next.id = existing.id
  await db.sessions.put(next)
  return next
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
  const existing = await db.sessions.where('uuid').equals(uuid).first()
  if (!existing) return undefined
  const tombstoned = tombstone(existing)
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
  const custom = live(await db.exercises.toArray())
  registerCustomExercises(custom)
  return custom
}

/** Read the custom exercises without re-registering (for management UIs). */
export async function getCustomExercises(): Promise<Exercise[]> {
  return live(await db.exercises.toArray())
}

/** Every stored custom exercise, tombstones included — used by sync. */
export async function getAllCustomExercises(): Promise<Exercise[]> {
  return db.exercises.toArray()
}

export async function saveCustomExercise(exercise: Exercise): Promise<Exercise> {
  const next = stamp(exercise)
  await db.exercises.put(next)
  await loadCustomExercises()
  return next
}

/** Tombstone a custom exercise so the removal reaches other devices too. */
export async function deleteCustomExercise(id: string): Promise<Exercise | undefined> {
  const existing = await db.exercises.get(id)
  if (!existing) return undefined
  const tombstoned = tombstone(existing)
  await db.exercises.put(tombstoned)
  await loadCustomExercises()
  return tombstoned
}

// ── Custom days (program builder) ───────────────────────
/** Read the user's custom days and merge them into the live split. */
export async function loadCustomDays(): Promise<DayTemplate[]> {
  const custom = live(await db.days.toArray())
  registerCustomDays(custom)
  return custom
}

/** Read the custom days without re-registering (for management UIs). */
export async function getCustomDays(): Promise<DayTemplate[]> {
  return live(await db.days.toArray())
}

/** Every stored custom day, tombstones included — used by sync. */
export async function getAllCustomDays(): Promise<DayTemplate[]> {
  return db.days.toArray()
}

export async function saveCustomDay(day: DayTemplate): Promise<DayTemplate> {
  const next = stamp(day)
  await db.days.put(next)
  await loadCustomDays()
  return next
}

/** Tombstone a custom day so the removal reaches other devices too. */
export async function deleteCustomDay(id: string): Promise<DayTemplate | undefined> {
  const existing = await db.days.get(id)
  if (!existing) return undefined
  const tombstoned = tombstone(existing)
  await db.days.put(tombstoned)
  await loadCustomDays()
  return tombstoned
}

// ── Goals ───────────────────────────────────────────────
export async function getGoals(): Promise<Goal[]> {
  return live(await db.goals.orderBy('createdAt').toArray())
}

/** Every stored goal, tombstones included — used by sync. */
export async function getAllGoals(): Promise<Goal[]> {
  return db.goals.toArray()
}

export async function saveGoal(goal: Goal): Promise<Goal> {
  const next = stamp(goal)
  await db.goals.put(next)
  return next
}

/** Tombstone a goal so the removal reaches other devices too. */
export async function deleteGoal(id: string): Promise<Goal | undefined> {
  const existing = await db.goals.get(id)
  if (!existing) return undefined
  const tombstoned = tombstone(existing)
  await db.goals.put(tombstoned)
  return tombstoned
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
  return live(await db.bodyweights.orderBy('at').toArray())
}

/** Every stored reading, tombstones included — used by sync. */
export async function getAllBodyLog(): Promise<BodyLog[]> {
  return db.bodyweights.toArray()
}

export async function saveBodyweight(kg: number, at: number = Date.now()): Promise<BodyLog> {
  const row = stamp<BodyLog>({ at: dayKey(at), kg })
  await db.bodyweights.put(row)
  return row
}

/** Tombstone a reading so the removal reaches other devices too. */
export async function deleteBodyweight(at: number): Promise<BodyLog | undefined> {
  const existing = await db.bodyweights.get(at)
  if (!existing) return undefined
  const tombstoned = tombstone(existing)
  await db.bodyweights.put(tombstoned)
  return tombstoned
}

// ── Applying cloud copies ───────────────────────────────
// The sync planner only hands over rows it judged newer than what's local, so
// each of these is a straight overwrite.

export async function applyRemoteExercises(rows: Exercise[]): Promise<void> {
  if (rows.length === 0) return
  await db.exercises.bulkPut(rows)
  await loadCustomExercises()
}

export async function applyRemoteDays(rows: DayTemplate[]): Promise<void> {
  if (rows.length === 0) return
  await db.days.bulkPut(rows)
  await loadCustomDays()
}

export async function applyRemoteGoals(rows: Goal[]): Promise<void> {
  if (rows.length === 0) return
  await db.goals.bulkPut(rows)
}

export async function applyRemoteBodyLog(rows: BodyLog[]): Promise<void> {
  if (rows.length === 0) return
  await db.bodyweights.bulkPut(rows)
}

// ── Export / import ─────────────────────────────────────
export const EXPORT_VERSION = 4

export interface BackupFile {
  version: number
  exportedAt: number
  sessions: Session[]
  settings?: Settings
  exercises: Exercise[]
  bodyweights: BodyLog[]
  days: DayTemplate[]
  goals: Goal[]
}

export async function exportData(): Promise<string> {
  const [sessions, settings, exercises, bodyweights, days, goals] = await Promise.all([
    db.sessions.toArray(),
    getSettings(),
    db.exercises.toArray(),
    db.bodyweights.toArray(),
    db.days.toArray(),
    db.goals.toArray(),
  ])
  return JSON.stringify(
    { version: EXPORT_VERSION, exportedAt: Date.now(), sessions, settings, exercises, bodyweights, days, goals },
    null,
    2,
  )
}

/** Row counts in a backup — enough to confirm a restore before it runs. */
export interface BackupSummary {
  sessions: number
  exercises: number
  days: number
  goals: number
  bodyweights: number
  exportedAt: number | null
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function arrayOf<T>(v: unknown, ok: (row: Record<string, unknown>) => boolean): T[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new Error('Invalid backup file')
  for (const row of v) {
    if (!isObj(row) || !ok(row)) throw new Error('Invalid backup file')
  }
  return v as T[]
}

/**
 * Parse and validate a backup, checking the shape of every collection rather
 * than only that `sessions` is an array. Anything that survives this is safe to
 * apply; anything that doesn't never reaches the point of clearing a table.
 */
export function parseBackup(json: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('Invalid backup file')
  }
  if (!isObj(raw) || !Array.isArray(raw.sessions)) throw new Error('Invalid backup file')

  return {
    version: typeof raw.version === 'number' ? raw.version : 0,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    settings: isObj(raw.settings) ? (raw.settings as unknown as Settings) : undefined,
    sessions: arrayOf<Session>(
      raw.sessions,
      (s) => typeof s.startedAt === 'number' && Array.isArray(s.entries),
    ),
    exercises: arrayOf<Exercise>(
      raw.exercises,
      (e) => typeof e.id === 'string' && typeof e.name === 'string' && typeof e.primary === 'string',
    ),
    days: arrayOf<DayTemplate>(
      raw.days,
      (d) => typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.slots),
    ),
    goals: arrayOf<Goal>(
      raw.goals,
      (g) => typeof g.id === 'string' && typeof g.exerciseId === 'string' && typeof g.targetE1rm === 'number',
    ),
    bodyweights: arrayOf<BodyLog>(
      raw.bodyweights,
      (b) => typeof b.at === 'number' && typeof b.kg === 'number',
    ),
  }
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  return {
    sessions: backup.sessions.length,
    exercises: backup.exercises.length,
    days: backup.days.length,
    goals: backup.goals.length,
    bodyweights: backup.bodyweights.length,
    exportedAt: backup.exportedAt || null,
  }
}

/** What's on this device now, in the same shape, for a before/after compare. */
export async function summarizeLocal(): Promise<BackupSummary> {
  const [sessions, exercises, days, goals, bodyweights] = await Promise.all([
    db.sessions.count(),
    db.exercises.count(),
    db.days.count(),
    db.goals.count(),
    db.bodyweights.count(),
  ])
  return { sessions, exercises, days, goals, bodyweights, exportedAt: null }
}

const SNAPSHOT_ID = 'pre-import'

/** Overwrite every table with a validated backup, in one transaction. */
async function applyBackup(parsed: BackupFile, rescue: string | null): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.settings, db.exercises, db.bodyweights, db.days, db.goals, db.snapshots],
    async () => {
      if (rescue !== null) await db.snapshots.put({ id: SNAPSHOT_ID, at: Date.now(), json: rescue })
      else await db.snapshots.delete(SNAPSHOT_ID)
      await db.sessions.clear()
      await db.sessions.bulkAdd(
        parsed.sessions.map(
          ({ id: _id, ...rest }) => ({ ...rest, uuid: rest.uuid ?? crypto.randomUUID() }) as Session,
        ),
      )
      if (parsed.settings) await db.settings.put({ ...parsed.settings, id: 'main' })
      await db.exercises.clear()
      await db.exercises.bulkAdd(parsed.exercises)
      await db.bodyweights.clear()
      await db.bodyweights.bulkAdd(parsed.bodyweights)
      await db.days.clear()
      await db.days.bulkAdd(parsed.days)
      await db.goals.clear()
      await db.goals.bulkAdd(parsed.goals)
    },
  )
  await loadCustomExercises()
  await loadCustomDays()
}

/**
 * Replace everything with the backup's contents. A restore is destructive by
 * design, so the current state is stashed first and `undoRestore` puts it back
 * if the file turned out to be the wrong one. Validation runs before anything
 * is cleared, and the write is one transaction, so a bad file leaves the device
 * untouched either way.
 */
export async function importData(json: string): Promise<number> {
  const parsed = parseBackup(json)
  const rescue = await exportData()
  await applyBackup(parsed, rescue)
  return parsed.sessions.length
}

/** The stashed pre-restore state, if a restore has run on this device. */
export async function getRestoreSnapshot(): Promise<Snapshot | undefined> {
  return db.snapshots.get(SNAPSHOT_ID)
}

/** Put back whatever the last restore replaced, then drop the snapshot. */
export async function undoRestore(): Promise<boolean> {
  const snap = await getRestoreSnapshot()
  if (!snap) return false
  await applyBackup(parseBackup(snap.json), null)
  return true
}

export async function wipeAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.settings, db.exercises, db.bodyweights, db.days, db.goals, db.snapshots],
    async () => {
      await db.sessions.clear()
      await db.settings.clear()
      await db.exercises.clear()
      await db.bodyweights.clear()
      await db.days.clear()
      await db.goals.clear()
      await db.snapshots.clear()
    },
  )
  await loadCustomExercises()
  await loadCustomDays()
}
