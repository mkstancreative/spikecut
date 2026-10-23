import { publishTo, SocialError } from '../social/index.js'
import { supabaseAdmin } from '../supabase.js'

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 10 * 60 * 1000

type Due = {
  id: string
  clip_id: string
  social_account_id: string
  title: string | null
  caption: string | null
  options: Record<string, unknown> | null
  attempts: number
}

/** Publish everything that's due. Called from the worker loop between clip jobs. */
export async function publishDue(): Promise<number> {
  const db = supabaseAdmin()
  const { data, error } = await db.rpc('claim_due_publications', { max_count: 3 })
  if (error) throw error
  const due = data as Due[]

  for (const p of due) {
    try {
      const [{ data: clip }, { data: acc }] = await Promise.all([
        db.from('clips').select('video_path, status').eq('id', p.clip_id).single(),
        db
          .from('social_accounts')
          .select('id, platform, external_id, meta, access_token_enc, refresh_token_enc, token_expires_at, status, display_name')
          .eq('id', p.social_account_id)
          .single(),
      ])
      if (!clip?.video_path || clip.status !== 'ready') throw new SocialError('Clip file is missing')
      if (!acc) throw new SocialError('Account was disconnected')

      // Platforms fetch the video themselves, so give them a short-lived signed link.
      const { data: signed, error: signErr } = await db.storage.from('clips').createSignedUrl(clip.video_path, 60 * 60)
      if (signErr) throw signErr

      console.log(`[publisher] posting to ${acc.platform} · ${acc.display_name}`)
      const result = await publishTo(acc, {
        videoUrl: signed.signedUrl,
        title: p.title ?? '',
        caption: p.caption ?? '',
        options: p.options ?? {},
      })
      await db
        .from('publications')
        .update({
          status: 'published',
          platform_post_id: result.postId,
          permalink: result.permalink,
          published_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id)
    } catch (e) {
      const err = e as SocialError
      const message = err.message?.slice(0, 500) ?? String(e)
      console.error('[publisher] failed:', message)
      if (err.needsReconnect) {
        await db.from('social_accounts').update({ status: 'reconnect', last_error: message }).eq('id', p.social_account_id)
      }
      // Transient errors retry a couple of times; auth problems wait for the user to reconnect.
      const retry = !err.needsReconnect && p.attempts < MAX_ATTEMPTS
      await db
        .from('publications')
        .update({
          status: retry ? 'scheduled' : 'failed',
          scheduled_at: retry ? new Date(Date.now() + RETRY_DELAY_MS).toISOString() : undefined,
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id)
    }
  }
  return due.length
}
