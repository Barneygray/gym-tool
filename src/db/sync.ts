import type { BodyLog, DayTemplate, Exercise, Goal, Session, Settings, SyncMeta } from '../types'
import { supabase, supabaseConfigured } from './supabaseClient'
import {
  applyRemoteBodyLog, applyRemoteDays, applyRemoteExercises, applyRemoteGoals, applyRemoteSessions,
  getAllBodyLog, getAllCustomDays, getAllCustomExercises, getAllGoals, getAllSessions, getSettings,
  putSettings,
} from './db'
import { planSessionSync, planSync, recordStamp, syncStamp } from '../engine/syncPlan'
import { ownerKey } from './syncKey'

export { supabaseConfigured }
export {
  generateSyncKey, getSyncKey, hasPrivateSyncKey, initSyncMode, setSyncKey, syncMode, syncModeDecided,
} from './syncKey'

interface SessionRow {
  uuid: string
  day_type: string
  started_at: number
  finished_at: number | null
  entries: Session['entries']
  readiness: Session['readiness'] | null
  updated_at: number | null
  deleted_at: number | null
}

/**
 * Everything that isn't a session rides one generic table: a `kind` tag, the
 * record's own id, and its JSON. That keeps custom exercises, custom days,
 * goals, and bodyweight readings on the same reconcile path as sessions without
 * a bespoke table — and a schema migration — per record type.
 */
type RecordKind = 'exercise' | 'day' | 'goal' | 'bodyweight'

interface RecordRow {
  kind: RecordKind
  id: string
  payload: unknown
  updated_at: number | null
  deleted_at: number | null
}

interface LocalRecord {
  kind: RecordKind
  id: string
  payload: SyncMeta
}

// ── Sync error surface ──────────────────────────────────
// Background pushes are fire-and-forget, so failures would otherwise vanish.
// Anything that talks to the cloud reports its outcome here; the UI subscribes.
type ErrorListener = (message: string | null) => void
let errorListeners: ErrorListener[] = []
let lastSyncError: string | null = null

export function onSyncError(cb: ErrorListener): () => void {
  errorListeners.push(cb)
  cb(lastSyncError)
  return () => {
    errorListeners = errorListeners.filter((l) => l !== cb)
  }
}

function reportSync(error: string | null): void {
  lastSyncError = error
  for (const l of errorListeners) l(error)
}

function sessionRow(session: Session, owner: string) {
  return {
    uuid: session.uuid,
    owner,
    day_type: session.dayType,
    started_at: session.startedAt,
    finished_at: session.finishedAt ?? null,
    entries: session.entries,
    readiness: session.readiness ?? null,
    updated_at: syncStamp(session),
    deleted_at: session.deletedAt ?? null,
  }
}

function recordRow(kind: RecordKind, id: string, payload: SyncMeta, owner: string) {
  return {
    owner,
    kind,
    id,
    payload,
    updated_at: recordStamp(payload),
    deleted_at: payload.deletedAt ?? null,
  }
}

/** `kind:id` is the composite key — ids only need to be unique within a kind. */
const compose = (kind: string, id: string) => `${kind}:${id}`

/**
 * Two-way reconciliation keyed on write time: push any local record the cloud is
 * missing or holds an older copy of, pull anything newer remotely. Edits and
 * deletions (tombstones) ride the same path — a change is just a newer write.
 * Offline and transient errors are surfaced to the UI and reconciled on the next
 * sync rather than thrown.
 */
export async function runSync(): Promise<void> {
  if (!supabase) return
  try {
    const owner = await ownerKey()
    await syncSessions(owner)
    await syncRecords(owner)
    await syncSettings(owner)
    reportSync(null)
  } catch (e) {
    reportSync(e instanceof Error ? `Cloud sync failed: ${e.message}` : 'Cloud sync failed.')
  }
}

async function syncSessions(owner: string): Promise<void> {
  if (!supabase) return
  const local = await getAllSessions()
  const { data: remoteMeta, error: metaError } = await supabase
    .from('sessions')
    .select('uuid, updated_at')
    .eq('owner', owner)
  if (metaError) throw new Error(metaError.message)

  const { toPush, toPullUuids } = planSessionSync(
    local,
    (remoteMeta ?? []).map((r) => ({ uuid: r.uuid as string, updatedAt: (r.updated_at as number) ?? 0 })),
  )

  if (toPush.length > 0) {
    const { error } = await supabase.from('sessions').upsert(toPush.map((s) => sessionRow(s, owner)))
    if (error) throw new Error(error.message)
  }

  if (toPullUuids.length > 0) {
    const { data: rows, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('owner', owner)
      .in('uuid', toPullUuids)
    if (error) throw new Error(error.message)
    const pulled: Session[] = (rows ?? []).map((r: SessionRow) => ({
      uuid: r.uuid,
      dayType: r.day_type as Session['dayType'],
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
      entries: r.entries,
      readiness: r.readiness ?? undefined,
      updatedAt: r.updated_at ?? undefined,
      deletedAt: r.deleted_at ?? undefined,
    }))
    await applyRemoteSessions(pulled)
  }
}

/**
 * Reconcile the four non-session record types. These used to be device-local,
 * which meant a replaced phone restored its sessions but not the custom
 * exercises those sessions referenced — leaving unknown ids that the tonnage,
 * hard-set, freshness, and PR calculations all quietly skipped.
 */
async function syncRecords(owner: string): Promise<void> {
  if (!supabase) return
  const [exercises, days, goals, bodyweights] = await Promise.all([
    getAllCustomExercises(),
    getAllCustomDays(),
    getAllGoals(),
    getAllBodyLog(),
  ])

  const localRows: LocalRecord[] = [
    ...exercises.map((e) => ({ kind: 'exercise' as const, id: e.id, payload: e })),
    ...days.map((d) => ({ kind: 'day' as const, id: String(d.id), payload: d })),
    ...goals.map((g) => ({ kind: 'goal' as const, id: g.id, payload: g })),
    ...bodyweights.map((b) => ({ kind: 'bodyweight' as const, id: String(b.at), payload: b })),
  ]

  const { data: remoteMeta, error: metaError } = await supabase
    .from('records')
    .select('kind, id, updated_at')
    .eq('owner', owner)
  if (metaError) throw new Error(metaError.message)

  const byKey = new Map(localRows.map((r) => [compose(r.kind, r.id), r]))
  const { pushKeys, pullKeys } = planSync(
    localRows.map((r) => ({ key: compose(r.kind, r.id), stamp: recordStamp(r.payload) })),
    (remoteMeta ?? []).map((r) => ({
      key: compose(r.kind as string, r.id as string),
      stamp: (r.updated_at as number) ?? 0,
    })),
  )

  if (pushKeys.length > 0) {
    const rows = pushKeys
      .map((k) => byKey.get(k))
      .filter((r): r is LocalRecord => r !== undefined)
      .map((r) => recordRow(r.kind, r.id, r.payload, owner))
    const { error } = await supabase.from('records').upsert(rows)
    if (error) throw new Error(error.message)
  }

  if (pullKeys.length === 0) return

  const wanted = new Set(pullKeys)
  const { data: rows, error } = await supabase.from('records').select('*').eq('owner', owner)
  if (error) throw new Error(error.message)

  const pulled = (rows ?? []).filter((r: RecordRow) => wanted.has(compose(r.kind, r.id)))
  const hydrate = <T>(kind: RecordKind): T[] =>
    pulled
      .filter((r: RecordRow) => r.kind === kind)
      .map((r: RecordRow) => ({
        ...(r.payload as object),
        updatedAt: r.updated_at ?? undefined,
        deletedAt: r.deleted_at ?? undefined,
      })) as T[]

  await applyRemoteExercises(hydrate<Exercise>('exercise'))
  await applyRemoteDays(hydrate<DayTemplate>('day'))
  await applyRemoteGoals(hydrate<Goal>('goal'))
  await applyRemoteBodyLog(hydrate<BodyLog>('bodyweight'))
}

/**
 * Settings reconcile like everything else — newest write wins. The old
 * behaviour pulled remote over local unconditionally on every app open, which
 * both lost whichever device had edited last and could only carry the three
 * columns the table happened to name. The whole object travels as JSON now, so
 * adding a setting is a client change, not a schema migration.
 */
async function syncSettings(owner: string): Promise<void> {
  if (!supabase) return
  const local = await getSettings()
  const { data: remote, error } = await supabase
    .from('settings')
    .select('payload, updated_ms')
    .eq('owner', owner)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const remoteStamp = (remote?.updated_ms as number) ?? 0
  const localStamp = local.updatedAt ?? 0

  if (remote?.payload && remoteStamp > localStamp) {
    await putSettings({ ...(remote.payload as Settings), id: 'main', updatedAt: remoteStamp })
    return
  }
  if (!remote || localStamp > remoteStamp) await pushSettings(local)
}

export async function pushSettings(settings: Settings): Promise<void> {
  if (!supabase) return
  const owner = await ownerKey()
  const { error } = await supabase.from('settings').upsert({
    owner,
    payload: settings,
    updated_ms: settings.updatedAt ?? Date.now(),
    // Kept in step so a device still running an older bundle, which reads these
    // named columns rather than the JSON payload, doesn't see stale values.
    bar_weight_kg: settings.barWeightKg,
    plates_kg: settings.platesKg,
    sound_on: settings.soundOn,
  })
  reportSync(error ? `Couldn't back up settings: ${error.message}` : null)
}

/** Fire-and-forget push of a single session write (create, edit, or delete). */
export async function pushSession(session: Session): Promise<void> {
  if (!supabase) return
  const owner = await ownerKey()
  const { error } = await supabase.from('sessions').upsert(sessionRow(session, owner))
  reportSync(error ? `Couldn't back up your last change: ${error.message}` : null)
}

/** Fire-and-forget push of one non-session record (create, edit, or delete). */
export async function pushRecord(
  kind: RecordKind,
  id: string,
  payload: SyncMeta | undefined,
): Promise<void> {
  if (!supabase || !payload) return
  const owner = await ownerKey()
  const { error } = await supabase.from('records').upsert(recordRow(kind, id, payload, owner))
  reportSync(error ? `Couldn't back up your last change: ${error.message}` : null)
}
