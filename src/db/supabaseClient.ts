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

export const supabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: true },
    })
  : null
