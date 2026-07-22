import type { Session, Settings } from '../types'
import { supabase, supabaseConfigured } from './supabaseClient'
import { getAllSessions, getSettings, mergeRemoteSessions, saveSettings } from './db'
import { planSessionSync } from '../engine/syncPlan'

export { supabaseConfigured }

export type SyncStatus =
  | { state: 'unconfigured' | 'signed-out' | 'sending-link' | 'link-sent' }
  | { state: 'syncing' | 'synced' | 'error'; email: string }

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

export function onAuthChange(cb: (email: string | null) => void): () => void {
  if (!supabase) return () => {}
  supabase.auth.getSession().then(({ data }) => cb(data.session?.user.email ?? null))
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user.email ?? null)
  })
  return () => sub.subscription.unsubscribe()
}

/** Send the login email. Supabase delivers both a magic link and a 6-digit code. */
export async function signInWithEmail(email: string): Promise<string | null> {
  if (!supabase) return 'Cloud backup is not configured yet.'
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  })
  return error?.message ?? null
}

/**
 * Verify the 6-digit code from the email. This is the reliable path for an
 * installed PWA on iOS, where a tapped magic link opens Safari (a separate
 * storage context) and never reaches the home-screen app.
 */
export async function verifyEmailCode(email: string, code: string): Promise<string | null> {
  if (!supabase) return 'Cloud backup is not configured yet.'
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
  return error?.message ?? null
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

/**
 * Full two-way reconciliation: push any local session the cloud doesn't have
 * yet, pull down any cloud session missing locally, and sync the settings
 * row. Safe to call repeatedly — every step is additive or idempotent.
 */
export async function runSync(): Promise<void> {
  if (!supabase) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const local = await getAllSessions()
  const { data: remoteMeta } = await supabase.from('sessions').select('uuid')
  const { toPush, toPullUuids } = planSessionSync(local, (remoteMeta ?? []).map((r) => r.uuid as string))

  if (toPush.length > 0) {
    const rows: SessionRow[] = toPush.map((s) => ({
      uuid: s.uuid,
      day_type: s.dayType,
      started_at: s.startedAt,
      finished_at: s.finishedAt ?? null,
      entries: s.entries,
    }))
    await supabase.from('sessions').upsert(rows.map((r) => ({ ...r, user_id: user.id })))
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

  await syncSettings(user.id)
}

async function syncSettings(userId: string): Promise<void> {
  if (!supabase) return
  const { data: remote } = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle()
  if (remote) {
    const row = remote as SettingsRow
    await saveSettings({
      id: 'main',
      barWeightKg: row.bar_weight_kg,
      platesKg: row.plates_kg,
      soundOn: row.sound_on,
    })
  } else {
    const local = await getSettings()
    await pushSettings(local)
  }
}

export async function pushSettings(settings: Settings): Promise<void> {
  if (!supabase) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('settings').upsert({
    user_id: user.id,
    bar_weight_kg: settings.barWeightKg,
    plates_kg: settings.platesKg,
    sound_on: settings.soundOn,
  })
}

export async function pushSession(session: Session): Promise<void> {
  if (!supabase) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('sessions').upsert({
    uuid: session.uuid,
    user_id: user.id,
    day_type: session.dayType,
    started_at: session.startedAt,
    finished_at: session.finishedAt ?? null,
    entries: session.entries,
  })
}
