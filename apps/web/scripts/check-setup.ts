/**
 * Sanity-checks env keys, the database migration and the Paystack connection.
 * Never prints secret values.
 *
 *   npm run check:setup
 */
import { serverEnv } from '../server/env'
import { paystack } from '../server/paystack'
import { supabaseAdmin } from '../server/supabase'

const tables = [
  'profiles',
  'workspaces',
  'workspace_members',
  'paystack_plans',
  'payments',
  'subscriptions',
  'day_passes',
  'credit_grants',
  'credit_spends',
]

let failures = 0
const ok = (msg: string) => console.log(`  ✓ ${msg}`)
const fail = (msg: string) => {
  failures++
  console.log(`  ✗ ${msg}`)
}

console.log('Supabase')
const db = supabaseAdmin()
for (const table of tables) {
  // Not a HEAD request: HEAD responses have no body, so a missing table would look like an empty one.
  const { count, error } = await db.from(table).select('*', { count: 'exact' }).limit(1)
  if (error) fail(`${table}: ${error.message}`)
  else ok(`${table} (${count ?? 0} rows)`)
}
{
  const { error } = await db.rpc('get_entitlements', { ws: crypto.randomUUID() }).single()
  if (error && /does not exist|Could not find/i.test(error.message)) fail(`get_entitlements: ${error.message}`)
  else ok('get_entitlements function')
}
{
  const { error } = await db.auth.admin.listUsers({ perPage: 1 })
  if (error) fail(`auth admin: ${error.message}`)
  else ok('secret key has admin access')
}

console.log('\nPaystack')
try {
  const mode = serverEnv.paystackSecretKey.startsWith('sk_live_') ? 'LIVE' : 'test'
  const plans = await paystack<{ plan_code: string; name: string }[]>('/plan?perPage=100')
  ok(`connected (${mode} mode), ${plans.length} plan(s) in account`)
  const ours = plans.filter((p) => p.name.startsWith('SpikeCut '))
  if (ours.length) ok(`${ours.length} SpikeCut plan(s) found`)
  else console.log('  • no SpikeCut plans yet — run: npm run paystack:sync-plans')
} catch (e) {
  fail(`Paystack: ${(e as Error).message}`)
}

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll good.')
process.exit(failures ? 1 : 0)
