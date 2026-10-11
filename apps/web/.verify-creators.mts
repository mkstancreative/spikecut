import { supabaseAdmin } from './server/supabase'
const db = supabaseAdmin()
const { data: creators, error } = await db.from('creators').select('id, platform, display_name, handle, is_live, last_checked_at, last_error, created_at').order('created_at')
if (error) { console.log('ERROR', error.message); process.exit(1) }
const now = Date.now()
console.log(`creators: ${creators.length}`)
for (const c of creators) {
  const { count } = await db.from('streams').select('id', { count: 'exact', head: true }).eq('creator_id', c.id)
  const { data: kinds } = await db.from('streams').select('kind, status').eq('creator_id', c.id)
  const summary = Object.entries((kinds ?? []).reduce((a: Record<string, number>, s) => ({ ...a, [`${s.kind}/${s.status}`]: (a[`${s.kind}/${s.status}`] ?? 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(' ')
  const ago = c.last_checked_at ? Math.round((now - new Date(c.last_checked_at).getTime()) / 1000) + 's ago' : 'never'
  console.log(`- [${c.platform}] ${c.display_name} ${c.handle ?? ''} | live=${c.is_live} | checked ${ago} | streams=${count} (${summary})${c.last_error ? ' | ERROR ' + c.last_error : ''}`)
}
