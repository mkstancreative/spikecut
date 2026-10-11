/**
 * Sanity-checks env keys, the database migration and the Paystack connection.
 * Never prints secret values.
 *
 *   npm run check:setup
 */
import { serverEnv } from '../server/env'
import { paystack } from '../server/paystack'
import { resolveChannel } from '../server/platforms'
import { twitchEnabled } from '../server/platforms/twitch'
import { youtubeEnabled } from '../server/platforms/youtube'
import { supabaseAdmin } from '../server/supabase'
import { existsSync } from 'node:fs'
import { tools } from '../server/worker/config'
import { run } from '../server/worker/exec'

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
  'creators',
  'streams',
  'jobs',
  'moments',
  'clips',
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

console.log('\nCreator platforms')
if (youtubeEnabled()) {
  try {
    const ch = await resolveChannel('https://www.youtube.com/@YouTube')
    ok(`YouTube key works (resolved ${ch.displayName})`)
  } catch (e) {
    fail(`YouTube: ${(e as Error).message}`)
  }
} else console.log('  • YouTube not configured (YOUTUBE_API_KEY empty)')
if (twitchEnabled()) {
  try {
    const ch = await resolveChannel('twitch.tv/twitch')
    ok(`Twitch keys work (resolved ${ch.displayName})`)
  } catch (e) {
    fail(`Twitch: ${(e as Error).message}`)
  }
} else console.log('  • Twitch not configured yet (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET empty)')

console.log('\nClip pipeline')
{
  const { data, error } = await db.storage.getBucket('clips')
  if (error || !data) fail(`storage bucket "clips": ${error?.message ?? 'missing'}`)
  else ok(`storage bucket "clips" (${data.public ? 'PUBLIC — should be private!' : 'private'})`)
}
for (const [name, cmd, args] of [
  ['ffmpeg', tools.ffmpeg, ['-version']],
  ['yt-dlp', tools.ytdlp, ['--version']],
  ['whisper.cpp', tools.whisper, ['--help']],
  ['python + opencv', tools.python, ['-c', 'import cv2, PIL; print(cv2.__version__)']],
] as const) {
  try {
    await run(cmd, [...args])
    ok(name)
  } catch (e) {
    fail(`${name}: ${(e as Error).message.slice(0, 120)}`)
  }
}
for (const [name, path] of [['speech model', tools.whisperModel], ['face model', tools.faceModel], ['caption font', tools.captionFont]]) {
  if (existsSync(path)) ok(`${name} (${path.split('/').pop()})`)
  else fail(`${name} missing at ${path}`)
}

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll good.')
process.exit(failures ? 1 : 0)
