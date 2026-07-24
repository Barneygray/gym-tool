import type { Session, Settings } from '../types'
import { supabase, supabaseConfigured, ACCOUNT_KEY } from './supabaseClient'
import { getAllSessions, getSettings, mergeRemoteSessions, saveSettings } from './db'
import { planSessionSync } from '../engine/syncPlan'

export { supabaseConfigured }

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
 * Full two-way reconciliation against the single shared backup account: push
 * any local session the cloud doesn't have yet, pull down any cloud session
 * missing locally, and sync the settings row. There is no sign-in — the app
 * carries a fixed account key, so every device that opens it backs up and
 * restores automatically. Safe to call repeatedly; every step is additive or
 * idempotent.
 */
export async function runSync(): Promise<void> {
  if (!supabase) return

  const local = await getAllSessions()
  const { data: remoteMeta } = await supabase.from('sessions').select('uuid').eq('account', ACCOUNT_KEY)
  const { toPush, toPullUuids } = planSessionSync(local, (remoteMeta ?? []).map((r) => r.uuid as string))

  if (toPush.length > 0) {
    const rows = toPush.map((s) => ({
      uuid: s.uuid,
      account: ACCOUNT_KEY,
      day_type: s.dayType,
      started_at: s.startedAt,
      finished_at: s.finishedAt ?? null,
      entries: s.entries,
    }))
    await supabase.from('sessions').upsert(rows)
  }

  if (toPullUuids.length > 0) {
    const { data: remoteRows } = await supabase
      .from('sessions')
      .select('*')
      .eq('account', ACCOUNT_KEY)
      .in('uuid', toPullUuids)
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
}

async function syncSettings(): Promise<void> {
  if (!supabase) return
  const { data: remote } = await supabase.from('settings').select('*').eq('account', ACCOUNT_KEY).maybeSingle()
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
  await supabase.from('settings').upsert({
    account: ACCOUNT_KEY,
    bar_weight_kg: settings.barWeightKg,
    plates_kg: settings.platesKg,
    sound_on: settings.soundOn,
  })
}

export async function pushSession(session: Session): Promise<void> {
  if (!supabase) return
  await supabase.from('sessions').upsert({
    uuid: session.uuid,
    account: ACCOUNT_KEY,
    day_type: session.dayType,
    started_at: session.startedAt,
    finished_at: session.finishedAt ?? null,
    entries: session.entries,
  })
}
