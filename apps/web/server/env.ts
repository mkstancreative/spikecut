import { parseCurrencies } from '../src/lib/pricing'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing environment variable ${name} — see apps/web/.env.example`)
  return value
}

// Read lazily so a missing key fails the request that needs it, not the whole server.
export const serverEnv = {
  get supabaseUrl() {
    return process.env.SUPABASE_URL?.trim() || required('VITE_SUPABASE_URL')
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY')
  },
  get paystackSecretKey() {
    return required('PAYSTACK_SECRET_KEY')
  },
  get appUrl() {
    return (process.env.APP_URL?.trim() || 'http://localhost:5180').replace(/\/$/, '')
  },
  get currencies() {
    return parseCurrencies(process.env.BILLING_CURRENCIES?.trim() || process.env.VITE_BILLING_CURRENCIES?.trim() || undefined)
  },
}
