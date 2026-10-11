/**
 * Background watcher: every MONITOR_INTERVAL_SECONDS, checks every active creator in a
 * workspace with a live plan. Runs locally via `npm run dev`; in production it moves to the worker host.
 */
import { refreshCreators, type CreatorRow } from './creators'
import { getEntitlements } from './entitlements'
import { enabledPlatforms } from './platforms'
import { supabaseAdmin } from './supabase'

const intervalMs = Math.max(30, Number(process.env.MONITOR_INTERVAL_SECONDS ?? 60)) * 1000

async function tick() {
  const platforms = enabledPlatforms()
  if (!platforms.length) return console.log('[monitor] no platforms configured — add YOUTUBE_API_KEY or Twitch keys')

  const { data, error } = await supabaseAdmin()
    .from('creators')
    .select('id, workspace_id, platform, channel_id, display_name')
    .eq('active', true)
    .in('platform', platforms)
  if (error) return console.error('[monitor] load creators:', error.message)

  // Skip workspaces whose plan/Day Pass has lapsed — no free monitoring.
  const workspaces = [...new Set(data.map((c) => c.workspace_id))]
  const paid = new Set<string>()
  await Promise.all(
    workspaces.map(async (ws) => {
      const ent = await getEntitlements(ws).catch(() => null)
      if (ent && ent.planId !== 'free') paid.add(ws)
    }),
  )
  const due = (data as CreatorRow[]).filter((c) => paid.has(c.workspace_id))
  if (!due.length) return

  const started = Date.now()
  await refreshCreators(due)
  console.log(`[monitor] checked ${due.length} creator(s) in ${Date.now() - started}ms`)
}

async function loop() {
  try {
    await tick()
  } catch (e) {
    console.error('[monitor] tick failed:', e)
  }
  setTimeout(loop, intervalMs)
}

console.log(`[monitor] watching every ${intervalMs / 1000}s`)
loop()
