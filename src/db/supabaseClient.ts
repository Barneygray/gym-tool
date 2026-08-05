import type { SupabaseClient } from '@supabase/supabase-js'
import { ownerKey } from './syncKey'

/**
 * Both values are meant to be public — Supabase's anon key only grants what
 * Row Level Security policies allow, so shipping it in the client bundle is
 * the standard, safe way to use it. Fill these in once the project exists
 * (Settings > API in the Supabase dashboard).
 */
const SUPABASE_URL = 'https://fkvesjkqgfjgvtcjyyjd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrdmVzamtxZ2ZqZ3Z0Y2p5eWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzA1OTQsImV4cCI6MjEwMDMwNjU5NH0.tqZpwvafghGx3LiC71qilUqiXVl6uDDy1Mj4or6LEGY'

export const supabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

/**
 * The header every request names its bucket in. Row Level Security matches
 * `owner` against it, so a request that omits it sees nothing at all — see the
 * access-control notes in `supabase-schema.sql`. Every query the client sends
 * already carried this value in its query string; sending it as a header too is
 * what lets the *server* enforce the scoping instead of trusting the client to
 * keep applying its own filter.
 */
export const OWNER_HEADER = 'x-forge-owner'

/** Client options for a given bucket. Split out so it can be asserted on. */
export function clientOptions(owner: string) {
  return {
    auth: { persistSession: true, detectSessionInUrl: true },
    global: { headers: { [OWNER_HEADER]: owner } },
  }
}

/**
 * The client is loaded on demand rather than imported eagerly. Sync is a
 * background job that runs *after* the first render, but a static import put
 * the whole Supabase library — comfortably the heaviest dependency here — in
 * front of the Train screen painting. This is a phone-first PWA opened on gym
 * wifi mid-session; that cost lands in exactly the wrong place.
 *
 * Cached per bucket rather than once: the header is baked into the client, so
 * changing the sync key (Setup → Backup & data) has to build a new one or every
 * later request would still claim the old bucket and come back empty. The
 * dynamic import itself is cached by the module system, so re-creating is cheap.
 */
let cached: { owner: string; client: Promise<SupabaseClient> } | null = null

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return null
  const owner = await ownerKey()
  if (cached?.owner !== owner) {
    cached = {
      owner,
      client: import('@supabase/supabase-js').then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions(owner)),
      ),
    }
  }
  return cached.client
}
