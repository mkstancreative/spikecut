import { Hono, type Context } from 'hono'
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
import { supabaseAdmin } from './supabase'

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
    .select('id, workspace_id, status, duration_seconds, analysis_status')
    .eq('id', c.req.param('id'))
    .maybeSingle()
  if (lookupErr) throw lookupErr // e.g. a missing migration — don't disguise it as "not found"
  if (!stream) throw new BillingError('Video not found', 404)
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

app.post('/accounts/connect', async (c) => {
  const user = await requireUser(c)
  const { workspaceId, provider } = await c.req.json<{ workspaceId?: string; provider?: 'google' | 'meta' }>()
  if (!workspaceId || (provider !== 'google' && provider !== 'meta')) throw new BillingError('Unknown provider')
  await requireMember(user.id, workspaceId)
  await requireActivePlan(workspaceId)
  if (!enabledProviders()[provider]) {
    throw new BillingError(`${provider === 'google' ? 'YouTube' : 'Instagram/Facebook'} isn’t set up on the server yet`, 503)
  }
  const state = await signState({ workspaceId, userId: user.id, provider })
  return c.json({ url: provider === 'google' ? googleAuthUrl(state) : metaAuthUrl(state) })
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
    const accounts = state.provider === 'google' ? await googleExchange(code) : await metaExchange(code)
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
  const body = await c.req.json<{ clipId?: string; accountIds?: string[]; title?: string; caption?: string; scheduledAt?: string }>()
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
