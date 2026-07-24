import type { Session, Settings } from '../types'
import { supabase, supabaseConfigured } from './supabaseClient'
import { getAllSessions, getSettings, applyRemoteSessions, saveSettings } from './db'
import { planSessionSync, syncStamp } from '../engine/syncPlan'

export { supabaseConfigured }

/**
 * Single-user personal app: every device shares one data bucket, keyed by this
 * constant. No accounts, no sign-in — open the app anywhere and it syncs to the
 * same rows automatically. (The Supabase anon key and this owner key are both
 * public in the bundle; protection is the obscurity of the app URL, which is
 * the accepted trade for zero-friction personal backup.)
 */
const OWNER = 'forge-owner'

interface SessionRow {
  uuid: string
  day_type: string
  started_at: number
  finished_at: number | null
  entries: Session['entries']
  updated_at: number | null
  deleted_at: number | null
}

interface SettingsRow {
  bar_weight_kg: number
  plates_kg: number[]
  sound_on: boolean
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

function rowFor(session: Session) {
  return {
    uuid: session.uuid,
    owner: OWNER,
    day_type: session.dayType,
    started_at: session.startedAt,
    finished_at: session.finishedAt ?? null,
    entries: session.entries,
    updated_at: syncStamp(session),
    deleted_at: session.deletedAt ?? null,
  }
}

/**
 * Two-way reconciliation keyed on write time: push any local session the cloud
 * is missing or has an older copy of, pull anything newer remotely, then sync
 * settings. Edits and deletions (tombstones) ride the same path — a change is
 * just a newer write. Offline/transient errors are surfaced to the UI and
 * reconciled on the next sync rather than thrown.
 */
export async function runSync(): Promise<void> {
  if (!supabase) return
  try {
    const local = await getAllSessions()
    const { data: remoteMeta, error: metaError } = await supabase
      .from('sessions')
      .select('uuid, updated_at')
      .eq('owner', OWNER)
    if (metaError) throw new Error(metaError.message)

    const { toPush, toPullUuids } = planSessionSync(
      local,
      (remoteMeta ?? []).map((r) => ({ uuid: r.uuid as string, updatedAt: (r.updated_at as number) ?? 0 })),
    )

    if (toPush.length > 0) {
      const { error } = await supabase.from('sessions').upsert(toPush.map(rowFor))
      if (error) throw new Error(error.message)
    }

    if (toPullUuids.length > 0) {
      const { data: remoteRows, error } = await supabase.from('sessions').select('*').in('uuid', toPullUuids)
      if (error) throw new Error(error.message)
      const pulled: Session[] = (remoteRows ?? []).map((r: SessionRow) => ({
        uuid: r.uuid,
        dayType: r.day_type as Session['dayType'],
        startedAt: r.started_at,
        finishedAt: r.finished_at ?? undefined,
        entries: r.entries,
        updatedAt: r.updated_at ?? undefined,
        deletedAt: r.deleted_at ?? undefined,
      }))
      await applyRemoteSessions(pulled)
    }

    await syncSettings()
    reportSync(null)
  } catch (e) {
    reportSync(e instanceof Error ? `Cloud sync failed: ${e.message}` : 'Cloud sync failed.')
  }
}

async function syncSettings(): Promise<void> {
  if (!supabase) return
  const { data: remote } = await supabase.from('settings').select('*').eq('owner', OWNER).maybeSingle()
  if (remote) {
    const row = remote as SettingsRow
    await saveSettings({
      id: 'main',
      barWeightKg: row.bar_weight_kg,
      platesKg: row.plates_kg,
      soundOn: row.sound_on,
    })
  } else {
    await pushSettings(await getSettings())
  }
}

export async function pushSettings(settings: Settings): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('settings').upsert({
    owner: OWNER,
    bar_weight_kg: settings.barWeightKg,
    plates_kg: settings.platesKg,
    sound_on: settings.soundOn,
  })
  reportSync(error ? `Couldn't back up settings: ${error.message}` : null)
}

/** Fire-and-forget push of a single session write (create, edit, or delete). */
export async function pushSession(session: Session): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('sessions').upsert(rowFor(session))
  reportSync(error ? `Couldn't back up your last change: ${error.message}` : null)
}
