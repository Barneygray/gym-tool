import type { SupabaseClient } from '@supabase/supabase-js'

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
 * The client is loaded on demand rather than imported eagerly. Sync is a
 * background job that runs *after* the first render, but a static import put
 * the whole Supabase library — comfortably the heaviest dependency here — in
 * front of the Train screen painting. This is a phone-first PWA opened on gym
 * wifi mid-session; that cost lands in exactly the wrong place.
 */
let clientPromise: Promise<SupabaseClient | null> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return Promise.resolve(null)
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: true },
    }),
  )
  return clientPromise
}
