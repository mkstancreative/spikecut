import { Hono, type Context } from 'hono'
import { cartoonStyle, MAX_CARTOON_SECONDS, MAX_DETAILS_CHARS } from '../src/lib/animatePresets'
import { getPlan, type Currency } from '../src/lib/pricing'
import { getEntitlements } from './entitlements'
import {
  applySuccessfulCharge,
  BillingError,
  disableSubscription,
  setSubscriptionStatus,
  startCheckout,
  upsertSubscription,
  workspaceForCustomer,
} from './billing'
import { queueRender } from './clips'
import { addCreator, refreshCreators, removeCreator, type CreatorRow } from './creators'
import { serverEnv } from './env'
import { PlatformError } from './platforms'
import { paystack, PaystackError, verifyPaystackSignature, type PaystackSubscription, type PaystackTransaction } from './paystack'
import { enabledProviders, saveAccounts, SocialError } from './social'
import { signState, verifyState } from './social/crypto'
import { googleAuthUrl, googleExchange } from './social/google'
import { metaAuthUrl, metaExchange } from './social/meta'
import { tiktokAuthUrl, tiktokExchange } from './social/tiktok'
import type { SocialProvider } from './social/types'
import { supabaseAdmin } from './supabase'
import { falEnabled } from './worker/fal'

type AuthedUser = { id: string; email: string }

export const app = new Hono().basePath('/api')

app.get('/health', (c) => c.json({ ok: true }))

// ── Auth helpers

async function requireUser(c: Context): Promise<AuthedUser> {
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new BillingError('Not signed in', 403)
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data.user?.email) throw new BillingError('Session expired — please sign in again', 403)
  return { id: data.user.id, email: data.user.email }
}

async function requireMember(userId: string, workspaceId: string) {
  const { data } = await supabaseAdmin()
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) throw new BillingError('You’re not a member of this workspace', 403)
}

async function requireBillingRole(userId: string, workspaceId: string) {
  const { data } = await supabaseAdmin()
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data || !['owner', 'admin'].includes(data.role)) {
    throw new BillingError('Only workspace owners and admins can manage billing', 403)
  }
}

// ── Billing

app.post('/billing/checkout', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{ workspaceId?: string; planId?: string; currency?: string }>()
  const plan = getPlan(body.planId ?? '')
  const currency = body.currency as Currency
  if (!body.workspaceId || !plan) throw new BillingError('Unknown plan')
  if (!serverEnv.currencies.includes(currency)) throw new BillingError(`${currency} isn't available yet`)
  await requireBillingRole(user.id, body.workspaceId)

  if (plan.period === 'month') {
    const { data: current } = await supabaseAdmin()
      .from('subscriptions')
      .select('plan_id')
      .eq('workspace_id', body.workspaceId)
      .eq('status', 'active')
      .maybeSingle()
    if (current?.plan_id === plan.id) throw new BillingError(`You're already on ${plan.name}`, 409)
  }

  const result = await startCheckout({ workspaceId: body.workspaceId, userId: user.id, email: user.email, plan, currency })
  return c.json(result)
})

// Paystack redirects back with ?reference=… — verify immediately so the user doesn't wait for the webhook.
app.get('/billing/verify', async (c) => {
  const user = await requireUser(c)
  const reference = c.req.query('reference')
  if (!reference) throw new BillingError('Missing reference')

  const { data: payment } = await supabaseAdmin()
    .from('payments')
    .select('workspace_id')
    .eq('reference', reference)
    .maybeSingle()
  if (!payment) throw new BillingError('Payment not found', 404)
  await requireBillingRole(user.id, payment.workspace_id)

  const tx = await paystack<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
  if (tx.status === 'success') await applySuccessfulCharge(tx)
  else if (tx.status === 'failed' || tx.status === 'abandoned') {
    await supabaseAdmin().from('payments').update({ status: tx.status }).eq('reference', reference).eq('status', 'pending')
  }
  return c.json({ status: tx.status })
})

app.post('/billing/cancel', async (c) => {
  const user = await requireUser(c)
  const { workspaceId } = await c.req.json<{ workspaceId?: string }>()
  if (!workspaceId) throw new BillingError('Missing workspace')
  await requireBillingRole(user.id, workspaceId)

  const { data: sub } = await supabaseAdmin()
    .from('subscriptions')
    .select('paystack_subscription_code, paystack_email_token')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  if (!sub) throw new BillingError('No active subscription', 404)

  await disableSubscription(sub.paystack_subscription_code, sub.paystack_email_token)
  // Access continues until current_period_end (see get_entitlements).
  await setSubscriptionStatus(sub.paystack_subscription_code, 'cancelled')
  return c.json({ ok: true })
})

// ── Creators

app.post('/creators', async (c) => {
  const user = await requireUser(c)
  const { workspaceId, url } = await c.req.json<{ workspaceId?: string; url?: string }>()
  if (!workspaceId || !url?.trim()) throw new BillingError('Paste a channel link')
  await requireMember(user.id, workspaceId)
  return c.json(await addCreator(workspaceId, url))
})

app.delete('/creators/:id', async (c) => {
  const user = await requireUser(c)
  const workspaceId = c.req.query('workspaceId')
  if (!workspaceId) throw new BillingError('Missing workspace')
  await requireMember(user.id, workspaceId)
  await removeCreator(workspaceId, c.req.param('id'))
  return c.json({ ok: true })
})

app.patch('/creators/:id', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{ capture_live?: boolean; auto_clip?: boolean; auto_clip_min_score?: number }>()
  const db = supabaseAdmin()
  const { data: creator, error: lookupErr } = await db.from('creators').select('id, workspace_id').eq('id', c.req.param('id')).maybeSingle()
  if (lookupErr) throw lookupErr
  if (!creator) throw new BillingError('Creator not found', 404)
  await requireMember(user.id, creator.workspace_id)

  const patch: Record<string, unknown> = {}
  if (typeof body.capture_live === 'boolean') patch.capture_live = body.capture_live
  if (typeof body.auto_clip === 'boolean') patch.auto_clip = body.auto_clip
  if (body.auto_clip_min_score != null) {
    const n = Math.round(Number(body.auto_clip_min_score))
    if (!(n >= 1 && n <= 99)) throw new BillingError('Score must be between 1 and 99')
    patch.auto_clip_min_score = n
  }
  const { error } = await db.from('creators').update(patch).eq('id', creator.id)
  if (error) throw error
  return c.json({ ok: true })
})

app.post('/creators/:id/refresh', async (c) => {
  const user = await requireUser(c)
  const { data: creator } = await supabaseAdmin()
    .from('creators')
    .select('id, workspace_id, platform, channel_id, display_name')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (!creator) throw new BillingError('Creator not found', 404)
  await requireMember(user.id, creator.workspace_id)
  await refreshCreators([creator as CreatorRow])
  return c.json({ ok: true })
})

// ── Clips pipeline

async function requireActivePlan(workspaceId: string) {
  const ent = await getEntitlements(workspaceId)
  if (ent.planId === 'free') throw new BillingError('You need an active plan or Day Pass', 403)
  return ent
}

app.post('/streams/:id/analyze', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: stream, error: lookupErr } = await db
    .from('streams')
    .select('id, workspace_id, status, duration_seconds, analysis_status, role')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (lookupErr) throw lookupErr // e.g. a missing migration — don't disguise it as "not found"
  if (!stream || stream.role === 'cartoon') throw new BillingError('Video not found', 404)
  await requireMember(user.id, stream.workspace_id)
  await requireActivePlan(stream.workspace_id)

  if (stream.status === 'live' || stream.status === 'upcoming') throw new BillingError('Wait for the stream to finish — live clipping comes next')
  if (stream.duration_seconds != null && stream.duration_seconds < 60) throw new BillingError('That video is too short to clip')
  if (stream.analysis_status === 'queued' || stream.analysis_status === 'running') throw new BillingError('Already finding moments in this video', 409)

  const { error } = await db.from('jobs').insert({ workspace_id: stream.workspace_id, type: 'analyze', payload: { streamId: stream.id } })
  if (error) throw error
  await db.from('streams').update({ analysis_status: 'queued', analysis_message: 'Waiting for the worker' }).eq('id', stream.id)
  return c.json({ ok: true })
})

app.post('/streams/:id/analyze/stop', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: stream, error: streamErr } = await db
    .from('streams')
    .select('id, workspace_id')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (streamErr) throw streamErr
  if (!stream) throw new BillingError('Video not found', 404)
  await requireMember(user.id, stream.workspace_id)

  const { data: jobs, error: jobsErr } = await db
    .from('jobs')
    .select('id')
    .eq('workspace_id', stream.workspace_id)
    .eq('type', 'analyze')
    .contains('payload', { streamId: stream.id })
    .in('status', ['queued', 'running'])
  if (jobsErr) throw jobsErr
  if (!jobs?.length) throw new BillingError('Moment finding is no longer running', 409)

  const { data: cancelled, error } = await db
    .from('jobs')
    .update({ status: 'failed', message: 'Stopped by user', finished_at: new Date().toISOString() })
    .in('id', jobs.map((job) => job.id))
    .in('status', ['queued', 'running'])
    .select('id')

  if (error) throw error
  if (!cancelled?.length) throw new BillingError('Moment finding is no longer running', 409)
  await db.from('streams').update({ analysis_status: 'none', analysis_message: 'Stopped' }).eq('id', stream.id)
  return c.json({ ok: true })
})

app.post('/moments/:id/render', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: moment, error: lookupErr } = await db
    .from('moments')
    .select('id, workspace_id, status')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (lookupErr) throw lookupErr
  if (!moment) throw new BillingError('Moment not found', 404)
  await requireMember(user.id, moment.workspace_id)
  await requireActivePlan(moment.workspace_id)
  if (['queued', 'rendering', 'rendered'].includes(moment.status)) throw new BillingError('This moment is already a clip', 409)

  await queueRender(moment.workspace_id, moment.id)
  return c.json({ ok: true })
})

// ── Animate: the user's own uploads

// Which cartoon engines this server can run (the AI styles need a fal.ai key).
app.get('/cartoon/engines', (c) => c.json({ local: true, fal: falEnabled() }))

function checkStyle(styleId: unknown) {
  const style = cartoonStyle(styleId)
  if (!style) throw new BillingError('Pick a style first')
  if (style.engine === 'fal' && !falEnabled()) throw new BillingError('AI cartoon styles aren’t set up on the server yet', 503)
  return style
}

type CartoonChoice = { style: string; details?: string }

/** A style from the request, or none when the video is only being added to the library. */
function cartoonChoice(body: { style?: string; details?: string }): CartoonChoice | null {
  if (!body.style) return null
  const style = checkStyle(body.style)
  const details = style.engine === 'fal' ? body.details?.trim().slice(0, MAX_DETAILS_CHARS) || undefined : undefined
  return { style: style.id, details }
}

type SourceVideo = { workspaceId: string; title: string; url: string; sourcePath: string | null; platform: 'upload' | 'link' }

/** One of your own videos in the library, ready to find moments in or cartoonify. */
async function addSourceVideo(v: SourceVideo) {
  const id = crypto.randomUUID()
  const { error } = await supabaseAdmin().from('streams').insert({
    id,
    workspace_id: v.workspaceId,
    creator_id: null,
    role: 'source',
    platform: v.platform,
    external_id: id,
    kind: 'upload',
    status: 'available',
    title: v.title,
    url: v.url,
    source_path: v.sourcePath,
    published_at: new Date().toISOString(),
    analysis_status: 'none',
  })
  if (error) throw error
  return id
}

// The browser has already uploaded the file into uploads/<workspaceId>/…; add it to the library, and cartoonify it if a style was picked.
app.post('/uploads', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{ workspaceId?: string; path?: string; title?: string; style?: string; details?: string }>()
  const { workspaceId, path } = body
  if (!workspaceId || !path) throw new BillingError('Missing upload')
  await requireMember(user.id, workspaceId)
  await requireActivePlan(workspaceId)
  const choice = cartoonChoice(body)

  const [folder, name, ...rest] = path.split('/')
  if (folder !== workspaceId || !name || rest.length) throw new BillingError('That upload belongs to another workspace', 403)
  const db = supabaseAdmin()
  const { data: found, error: listErr } = await db.storage.from('uploads').list(workspaceId, { search: name, limit: 1 })
  if (listErr) throw listErr
  if (!found?.some((f) => f.name === name)) throw new BillingError('Upload not found — try uploading again', 404)

  const video = { workspaceId, title: body.title?.trim().slice(0, 200) || 'Untitled upload', url: path, sourcePath: path, platform: 'upload' as const }
  const id = await addSourceVideo(video)
  return c.json({ id, cartoonId: choice ? await queueCartoon({ ...video, ...choice, sourceStreamId: id }) : null })
})

/** A cartoon is its own stream pointing back at the video it was made from; the cartoonify job takes it from there. */
async function queueCartoon(v: SourceVideo & CartoonChoice & { sourceStreamId: string }) {
  const db = supabaseAdmin()
  const id = crypto.randomUUID()
  const { error } = await db.from('streams').insert({
    id,
    workspace_id: v.workspaceId,
    creator_id: null,
    role: 'cartoon',
    source_stream_id: v.sourceStreamId,
    platform: v.platform,
    external_id: id,
    kind: 'upload',
    status: 'available',
    title: v.title,
    url: v.url,
    source_path: v.sourcePath,
    published_at: new Date().toISOString(),
    analysis_status: 'queued',
    analysis_message: 'Waiting for the worker',
  })
  if (error) throw error
  const { error: jobErr } = await db
    .from('jobs')
    .insert({ workspace_id: v.workspaceId, type: 'cartoonify', payload: { streamId: id, style: v.style, details: v.details } })
  if (jobErr) throw jobErr
  return id
}

// The worker downloads it with yt-dlp, so anything yt-dlp supports works (TikTok, Instagram, X, Facebook, YouTube…).
// Only public web addresses: the worker would otherwise fetch whatever is on its own network.
function publicVideoUrl(raw: string | undefined) {
  let url: URL
  try {
    url = new URL(raw?.trim() ?? '')
  } catch {
    throw new BillingError('That doesn’t look like a link — paste the full address, starting with https://')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const privateHost =
    !host.includes('.') ||
    /\.(local|localhost|internal|lan|home|corp)$/.test(host) ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.includes(':') // IPv6 literals
  if (!['http:', 'https:'].includes(url.protocol) || privateHost || url.username || url.password) {
    throw new BillingError('Paste a public link to a video post')
  }
  return url
}

app.post('/uploads/link', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{ workspaceId?: string; url?: string; style?: string; details?: string }>()
  const { workspaceId } = body
  if (!workspaceId) throw new BillingError('Missing workspace')
  await requireMember(user.id, workspaceId)
  await requireActivePlan(workspaceId)
  const url = publicVideoUrl(body.url)
  const choice = cartoonChoice(body)
  // The worker replaces this with the post's real title once it has looked the link up.
  const title = `Video from ${url.hostname.replace(/^(www|m|vm|vt)\./, '')}`
  const video = { workspaceId, title, url: url.toString(), sourcePath: null, platform: 'link' as const }
  const id = await addSourceVideo(video)
  return c.json({ id, cartoonId: choice ? await queueCartoon({ ...video, ...choice, sourceStreamId: id }) : null })
})

// Cartoonify any video in the library — a creator's or your own.
app.post('/streams/:id/cartoonify', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{ style?: string; details?: string }>().catch(() => ({}) as { style?: string; details?: string })
  const db = supabaseAdmin()
  const { data: stream, error } = await db
    .from('streams')
    .select('id, workspace_id, role, status, title, url, source_path, duration_seconds')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (error) throw error
  if (!stream || stream.role !== 'source') throw new BillingError('Video not found', 404)
  await requireMember(user.id, stream.workspace_id)
  await requireActivePlan(stream.workspace_id)
  if (stream.status === 'live' || stream.status === 'upcoming') throw new BillingError('Wait for the stream to finish first')
  if (stream.duration_seconds != null && stream.duration_seconds > MAX_CARTOON_SECONDS) {
    throw new BillingError(`Videos can be up to ${MAX_CARTOON_SECONDS / 60} minutes to cartoonify`)
  }
  const choice = cartoonChoice(body)
  if (!choice) throw new BillingError('Pick a style first')
  const id = await queueCartoon({
    workspaceId: stream.workspace_id,
    title: stream.title ?? 'Untitled video',
    url: stream.url,
    sourcePath: stream.source_path,
    platform: stream.source_path ? 'upload' : 'link',
    ...choice,
    sourceStreamId: stream.id,
  })
  return c.json({ id })
})

// Try a failed cartoon again, with the same style unless another is given. Credits were refunded on failure.
app.post('/uploads/:id/retry', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{ style?: string }>().catch(() => ({}) as { style?: string })
  const db = supabaseAdmin()
  const { data: stream, error } = await db
    .from('streams')
    .select('id, workspace_id, role, analysis_status')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (error) throw error
  if (!stream || stream.role !== 'cartoon') throw new BillingError('Cartoon not found', 404)
  await requireMember(user.id, stream.workspace_id)
  await requireActivePlan(stream.workspace_id)
  if (stream.analysis_status !== 'failed') throw new BillingError('Only failed cartoons can be retried', 409)

  const { data: last } = await db
    .from('jobs')
    .select('payload')
    .eq('type', 'cartoonify')
    .eq('payload->>streamId', stream.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const prev = (last?.payload ?? {}) as { style?: string; details?: string }
  const style = checkStyle(body.style ?? prev.style)
  const { error: jobErr } = await db
    .from('jobs')
    .insert({ workspace_id: stream.workspace_id, type: 'cartoonify', payload: { streamId: stream.id, style: style.id, details: prev.details } })
  if (jobErr) throw jobErr
  await db.from('streams').update({ analysis_status: 'queued', analysis_message: 'Waiting for the worker' }).eq('id', stream.id)
  return c.json({ ok: true })
})

// Delete one of your own videos (with its cartoons) or a single cartoon. Creators' videos come and go with the creator.
app.delete('/uploads/:id', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: stream, error } = await db
    .from('streams')
    .select('id, workspace_id, creator_id, source_path, analysis_status')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (error) throw error
  if (!stream || stream.creator_id) throw new BillingError('Upload not found', 404)
  await requireMember(user.id, stream.workspace_id)

  // This video plus any cartoons made from it — they go together.
  const { data: children, error: childErr } = await db.from('streams').select('id, analysis_status').eq('source_stream_id', stream.id)
  if (childErr) throw childErr
  const all = [stream, ...(children ?? [])]
  const ids = all.map((s) => s.id)
  if (all.some((s) => s.analysis_status === 'running')) throw new BillingError('Wait for the scan or cartoon to finish first', 409)

  const { data: clips, error: clipErr } = await db.from('clips').select('id, status, video_path, thumbnail_path').in('stream_id', ids)
  if (clipErr) throw clipErr
  if (clips?.some((cl) => cl.status === 'rendering')) throw new BillingError('Wait for the clip or cartoon to finish first', 409)
  const { count: posting } = await db
    .from('publications')
    .select('id', { count: 'exact', head: true })
    .in('clip_id', clips?.map((cl) => cl.id) ?? [])
    .eq('status', 'publishing')
  if (posting) throw new BillingError('A clip from this video is being posted right now — try again in a minute', 409)

  const clipFiles = (clips ?? []).flatMap((cl) => [cl.video_path, cl.thumbnail_path]).filter(Boolean) as string[]
  if (clipFiles.length) {
    const { error: rmErr } = await db.storage.from('clips').remove(clipFiles)
    if (rmErr) throw rmErr
  }
  // The uploaded file is shared between a video and its cartoons — only remove it when nothing else still uses it.
  if (stream.source_path) {
    const { count: sharing, error: shareErr } = await db
      .from('streams')
      .select('id', { count: 'exact', head: true })
      .eq('source_path', stream.source_path)
      .not('id', 'in', `(${ids.join(',')})`)
    if (shareErr) throw shareErr
    if (!sharing) {
      const { error: rmErr } = await db.storage.from('uploads').remove([stream.source_path])
      if (rmErr) throw rmErr
    }
  }
  // Moments, clips, cartoons and their posts go with it (FK cascade).
  const { error: delErr } = await db.from('streams').delete().eq('id', stream.id)
  if (delErr) throw delErr
  return c.json({ ok: true })
})

// ── Cleaning up clips & moments

app.delete('/clips/:id', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: clip, error } = await db
    .from('clips')
    .select('id, workspace_id, moment_id, status, video_path, thumbnail_path')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (error) throw error
  if (!clip) throw new BillingError('Clip not found', 404)
  await requireMember(user.id, clip.workspace_id)
  if (clip.status === 'rendering') throw new BillingError('Wait for this clip to finish rendering first', 409)

  const { count: posting } = await db
    .from('publications')
    .select('id', { count: 'exact', head: true })
    .eq('clip_id', clip.id)
    .eq('status', 'publishing')
  if (posting) throw new BillingError('This clip is being posted right now — try again in a minute', 409)

  const files = [clip.video_path, clip.thumbnail_path].filter(Boolean) as string[]
  if (files.length) {
    const { error: rmErr } = await db.storage.from('clips').remove(files)
    if (rmErr) throw rmErr
  }
  // Deleting the clip also removes its scheduled/past post records (FK cascade).
  // The moment goes away too, so it doesn't reappear as "Make clip".
  const { error: delErr } = await db.from('moments').delete().eq('id', clip.moment_id)
  if (delErr) throw delErr
  return c.json({ ok: true })
})

app.delete('/moments/:id', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: moment, error } = await db.from('moments').select('id, workspace_id, status').eq('id', c.req.param('id')).maybeSingle()
  if (error) throw error
  if (!moment) throw new BillingError('Moment not found', 404)
  await requireMember(user.id, moment.workspace_id)
  if (!['detected', 'failed'].includes(moment.status)) throw new BillingError('That moment is already a clip — delete the clip instead', 409)
  const { error: delErr } = await db.from('moments').delete().eq('id', moment.id)
  if (delErr) throw delErr
  return c.json({ ok: true })
})

// Clear every unused moment from one video (keeps anything already turned into a clip).
app.delete('/streams/:id/moments', async (c) => {
  const user = await requireUser(c)
  const db = supabaseAdmin()
  const { data: stream, error } = await db.from('streams').select('id, workspace_id, analysis_status').eq('id', c.req.param('id')).maybeSingle()
  if (error) throw error
  if (!stream) throw new BillingError('Video not found', 404)
  await requireMember(user.id, stream.workspace_id)
  if (stream.analysis_status === 'queued' || stream.analysis_status === 'running') {
    throw new BillingError('Wait for the scan to finish first', 409)
  }
  const { data: removed, error: delErr } = await db
    .from('moments')
    .delete()
    .eq('stream_id', stream.id)
    .in('status', ['detected', 'failed'])
    .select('id')
  if (delErr) throw delErr
  const { count: kept } = await db.from('moments').select('id', { count: 'exact', head: true }).eq('stream_id', stream.id)
  // With nothing left, reset the video so "Find moments" shows again.
  await db
    .from('streams')
    .update(kept ? { analysis_message: `${kept} clip${kept === 1 ? '' : 's'} kept` } : { analysis_status: 'none', analysis_message: null })
    .eq('id', stream.id)
  return c.json({ ok: true, removed: removed?.length ?? 0 })
})

// ── Connected accounts (OAuth)

app.get('/accounts/providers', (c) => c.json(enabledProviders()))

const providerNames: Record<SocialProvider, string> = { google: 'YouTube', meta: 'Instagram/Facebook', tiktok: 'TikTok' }

app.post('/accounts/connect', async (c) => {
  const user = await requireUser(c)
  const { workspaceId, provider } = await c.req.json<{ workspaceId?: string; provider?: SocialProvider }>()
  if (!workspaceId || !provider || !(provider in providerNames)) throw new BillingError('Unknown provider')
  await requireMember(user.id, workspaceId)
  await requireActivePlan(workspaceId)
  if (!enabledProviders()[provider]) throw new BillingError(`${providerNames[provider]} isn’t set up on the server yet`, 503)
  const state = await signState({ workspaceId, userId: user.id, provider })
  const url = provider === 'google' ? googleAuthUrl(state) : provider === 'meta' ? metaAuthUrl(state) : tiktokAuthUrl(state)
  return c.json({ url })
})

// Browser lands here from Google/Meta; we finish the exchange and send them back to the Accounts page.
app.get('/oauth/:provider/callback', async (c) => {
  const back = (params: Record<string, string>) => c.redirect(`${serverEnv.appUrl}/app/accounts?${new URLSearchParams(params)}`)
  const denied = c.req.query('error_description') ?? c.req.query('error')
  if (denied) return back({ error: denied === 'access_denied' ? 'Connection cancelled' : denied })
  try {
    const state = await verifyState(c.req.query('state'))
    if (state.provider !== c.req.param('provider')) throw new Error('Provider mismatch')
    const code = c.req.query('code')
    if (!code) throw new Error('Missing authorisation code')
    const exchange = { google: googleExchange, meta: metaExchange, tiktok: tiktokExchange }[state.provider as SocialProvider]
    if (!exchange) throw new Error('Unknown provider')
    const accounts = await exchange(code)
    const { saved, skipped } = await saveAccounts(state.workspaceId, state.userId, accounts)
    return back({ connected: String(saved), ...(skipped ? { skipped: String(skipped) } : {}) })
  } catch (e) {
    console.error('[oauth]', e)
    return back({ error: (e as Error).message ?? 'Connection failed' })
  }
})

app.delete('/accounts/:id', async (c) => {
  const user = await requireUser(c)
  const workspaceId = c.req.query('workspaceId')
  if (!workspaceId) throw new BillingError('Missing workspace')
  await requireMember(user.id, workspaceId)
  const { error } = await supabaseAdmin().from('social_accounts').delete().eq('id', c.req.param('id')).eq('workspace_id', workspaceId)
  if (error) throw error
  return c.json({ ok: true })
})

// ── Publishing schedule

app.post('/publications', async (c) => {
  const user = await requireUser(c)
  const body = await c.req.json<{
    clipId?: string
    accountIds?: string[]
    title?: string
    caption?: string
    scheduledAt?: string
    tiktokPrivacy?: string
  }>()
  const db = supabaseAdmin()
  const { data: clip, error: clipErr } = await db.from('clips').select('id, workspace_id, status').eq('id', body.clipId ?? '').maybeSingle()
  if (clipErr) throw clipErr
  if (!clip) throw new BillingError('Clip not found', 404)
  if (clip.status !== 'ready') throw new BillingError('That clip isn’t ready yet')
  await requireMember(user.id, clip.workspace_id)
  await requireActivePlan(clip.workspace_id)

  const ids = [...new Set(body.accountIds ?? [])]
  if (!ids.length) throw new BillingError('Pick at least one account')
  const { data: accounts, error: accErr } = await db
    .from('social_accounts')
    .select('id, platform, status')
    .eq('workspace_id', clip.workspace_id)
    .in('id', ids)
  if (accErr) throw accErr
  if (accounts.length !== ids.length) throw new BillingError('One of those accounts isn’t connected to this workspace')
  const broken = accounts.find((a) => a.status !== 'active')
  if (broken) throw new BillingError(`Reconnect your ${broken.platform} account first`)
  // TikTok requires the poster to pick who can see it — there's deliberately no default.
  const privacy = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].find((p) => p === body.tiktokPrivacy)
  if (accounts.some((a) => a.platform === 'tiktok') && !privacy) throw new BillingError('Choose who can see the TikTok post')

  const when = body.scheduledAt ? new Date(body.scheduledAt) : new Date()
  if (Number.isNaN(when.getTime())) throw new BillingError('Invalid date')
  if (when.getTime() < Date.now() - 60_000) throw new BillingError('Pick a time in the future')

  const { error } = await db.from('publications').upsert(
    accounts.map((a) => ({
      workspace_id: clip.workspace_id,
      clip_id: clip.id,
      social_account_id: a.id,
      platform: a.platform,
      title: body.title?.trim() || null,
      caption: body.caption?.trim() || null,
      options: a.platform === 'tiktok' ? { privacyLevel: privacy } : {},
      scheduled_at: when.toISOString(),
      status: 'scheduled',
      attempts: 0,
      error: null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'clip_id,social_account_id' },
  )
  if (error) throw error
  return c.json({ ok: true, count: accounts.length })
})

async function ownPublication(c: Context) {
  const user = await requireUser(c)
  const { data: pub, error } = await supabaseAdmin()
    .from('publications')
    .select('id, workspace_id, status')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (error) throw error
  if (!pub) throw new BillingError('Post not found', 404)
  await requireMember(user.id, pub.workspace_id)
  return pub
}

app.post('/publications/:id/cancel', async (c) => {
  const pub = await ownPublication(c)
  if (pub.status !== 'scheduled') throw new BillingError('Only scheduled posts can be cancelled', 409)
  await supabaseAdmin().from('publications').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', pub.id)
  return c.json({ ok: true })
})

app.post('/publications/:id/retry', async (c) => {
  const pub = await ownPublication(c)
  if (pub.status !== 'failed' && pub.status !== 'cancelled') throw new BillingError('That post isn’t failed or cancelled', 409)
  await supabaseAdmin()
    .from('publications')
    .update({ status: 'scheduled', scheduled_at: new Date().toISOString(), attempts: 0, error: null, updated_at: new Date().toISOString() })
    .eq('id', pub.id)
  return c.json({ ok: true })
})

// ── Paystack webhook

app.post('/paystack/webhook', async (c) => {
  const raw = await c.req.text()
  if (!(await verifyPaystackSignature(raw, c.req.header('x-paystack-signature')))) {
    return c.json({ error: 'invalid signature' }, 401)
  }

  const event = JSON.parse(raw) as { event: string; data: Record<string, unknown> }
  switch (event.event) {
    case 'charge.success':
      await applySuccessfulCharge(event.data as unknown as PaystackTransaction)
      break
    case 'subscription.create': {
      const sub = event.data as unknown as PaystackSubscription
      const customerCode = typeof sub.customer === 'object' ? sub.customer.customer_code : undefined
      const workspaceId = customerCode && (await workspaceForCustomer(customerCode))
      if (workspaceId) await upsertSubscription(workspaceId, sub)
      break
    }
    case 'subscription.not_renew':
      await setSubscriptionStatus(String(event.data.subscription_code), 'non-renewing')
      break
    case 'subscription.disable':
      await setSubscriptionStatus(String(event.data.subscription_code), String(event.data.status ?? 'cancelled'))
      break
    case 'invoice.payment_failed': {
      const sub = event.data.subscription as { subscription_code?: string } | undefined
      if (sub?.subscription_code) await setSubscriptionStatus(sub.subscription_code, 'attention')
      break
    }
    default:
    // Acknowledge everything else so Paystack doesn't retry.
  }
  return c.json({ received: true })
})

// ── Errors

app.onError((err, c) => {
  if (err instanceof BillingError) return c.json({ error: err.message }, err.status)
  if (err instanceof PlatformError || err instanceof SocialError) return c.json({ error: err.message }, 400)
  if (err instanceof PaystackError) {
    console.error('[paystack]', err.status, err.message)
    return c.json({ error: `Payment provider error: ${err.message}` }, 502)
  }
  // Supabase errors are plain objects, not Error instances — log the whole thing.
  console.error('[api]', c.req.method, c.req.path, err)
  const detail = err instanceof Error ? err.message : JSON.stringify(err)
  // Real cause locally; generic message in production so internals don't leak.
  return c.json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : detail }, 500)
})
