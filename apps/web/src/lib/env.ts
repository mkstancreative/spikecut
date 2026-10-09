import { parseCurrencies } from './pricing'

// Blank lines in .env.local come through as '' — treat them as unset.
const read = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

export const env = {
  supabaseUrl: read(import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: read(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
}

export const billingCurrencies = parseCurrencies(read(import.meta.env.VITE_BILLING_CURRENCIES))

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseKey)
