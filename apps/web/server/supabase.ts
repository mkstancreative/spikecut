import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serverEnv } from './env'

let admin: SupabaseClient | undefined

// Service-role client: bypasses RLS. Only ever used server-side.
export function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}
