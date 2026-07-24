import { createClient } from '@supabase/supabase-js'

/**
 * Both values are meant to be public — Supabase's anon key only grants what
 * Row Level Security policies allow, so shipping it in the client bundle is
 * the standard, safe way to use it. Fill these in once the project exists
 * (Settings > API in the Supabase dashboard).
 */
const SUPABASE_URL = 'https://fkvesjkqgfjgvtcjyyjd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrdmVzamtxZ2ZqZ3Z0Y2p5eWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzA1OTQsImV4cCI6MjEwMDMwNjU5NH0.tqZpwvafghGx3LiC71qilUqiXVl6uDDy1Mj4or6LEGY'

/**
 * The whole app backs up under this one fixed account — there is no sign-in.
 * Every device that opens the app carries this key in its bundle, so it saves
 * to and restores from the same cloud rows automatically, with zero taps. The
 * key partitions this app's data; it is not a password (anyone who inspected
 * the app's public code could read it), which is a fine trade for a personal
 * training log on an obscure URL. To start a fresh, separate backup, change it.
 */
export const ACCOUNT_KEY = 'ce863c6b-f7c8-497e-a963-8de07e22d7c6'

export const supabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
  : null
