import { createClient } from '@supabase/supabase-js'

/**
 * Both values are meant to be public — Supabase's anon key only grants what
 * Row Level Security policies allow, so shipping it in the client bundle is
 * the standard, safe way to use it. Fill these in once the project exists
 * (Settings > API in the Supabase dashboard).
 */
const SUPABASE_URL = ''
const SUPABASE_ANON_KEY = ''

export const supabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: true },
    })
  : null
