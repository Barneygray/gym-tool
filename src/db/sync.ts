import type { Session, Settings } from '../types'
import { supabase, supabaseConfigured } from './supabaseClient'
import { getAllSessions, getSettings, mergeRemoteSessions, saveSettings } from './db'
import { planSessionSync } from '../engine/syncPlan'

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
}

interface SettingsRow {
  bar_weight_kg: number
  plates_kg: number[]
  sound_on: boolean
}

/**
 * Two-way reconciliation: push any local session the cloud lacks, pull any
 * cloud session missing locally, then sync settings. Safe to call repeatedly —
 * every step is additive or idempotent. Fails silently when offline; the next
 * sync (on the next app open) reconciles whatever was missed.
 */
export async function runSync(): Promise<void> {
  if (!supabase) return
  try {
    const local = await getAllSessions()
    const { data: remoteMeta, error } = await supabase.from('sessions').select('uuid').eq('owner', OWNER)
    if (error) return
    const { toPush, toPullUuids } = planSessionSync(local, (remoteMeta ?? []).map((r) => r.uuid as string))

    if (toPush.length > 0) {
      const rows = toPush.map((s) => ({
        uuid: s.uuid,
        owner: OWNER,
        day_type: s.dayType,
        started_at: s.startedAt,
        finished_at: s.finishedAt ?? null,
        entries: s.entries,
      }))
      await supabase.from('sessions').upsert(rows)
    }

    if (toPullUuids.length > 0) {
      const { data: remoteRows } = await supabase.from('sessions').select('*').in('uuid', toPullUuids)
      const pulled: Session[] = (remoteRows ?? []).map((r: SessionRow) => ({
        uuid: r.uuid,
        dayType: r.day_type as Session['dayType'],
        startedAt: r.started_at,
        finishedAt: r.finished_at ?? undefined,
        entries: r.entries,
      }))
      await mergeRemoteSessions(pulled)
    }

    await syncSettings()
  } catch {
    // Offline or transient network error — the next sync catches up.
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
  try {
    await supabase.from('settings').upsert({
      owner: OWNER,
      bar_weight_kg: settings.barWeightKg,
      plates_kg: settings.platesKg,
      sound_on: settings.soundOn,
    })
  } catch {
    // Offline — reconciled on the next full sync.
  }
}

export async function pushSession(session: Session): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('sessions').upsert({
      uuid: session.uuid,
      owner: OWNER,
      day_type: session.dayType,
      started_at: session.startedAt,
      finished_at: session.finishedAt ?? null,
      entries: session.entries,
    })
  } catch {
    // Offline — this session is still saved locally and pushed on the next sync.
  }
}
