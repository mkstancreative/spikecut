import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Falls back to a dummy URL so the marketing site still renders before keys are set;
// auth screens show a setup notice instead (see isSupabaseConfigured).
export const supabase = createClient(env.supabaseUrl ?? 'http://localhost', env.supabaseKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})
