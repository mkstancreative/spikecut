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
import { addCreator, refreshCreators, removeCreator, type CreatorRow } from './creators'
import { serverEnv } from './env'
import { PlatformError } from './platforms'
import { paystack, PaystackError, verifyPaystackSignature, type PaystackSubscription, type PaystackTransaction } from './paystack'
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
  const { data: stream } = await db
    .from('streams')
    .select('id, workspace_id, status, duration_seconds, analysis_status')
    .eq('id', c.req.param('id'))
    .maybeSingle()
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
  const { data: moment } = await db.from('moments').select('id, workspace_id, status').eq('id', c.req.param('id')).maybeSingle()
  if (!moment) throw new BillingError('Moment not found', 404)
  await requireMember(user.id, moment.workspace_id)
  await requireActivePlan(moment.workspace_id)
  if (['queued', 'rendering', 'rendered'].includes(moment.status)) throw new BillingError('This moment is already a clip', 409)

  // Reserve 1 credit up front (refunded by the worker if rendering fails).
  const jobId = crypto.randomUUID()
  const { data: charged, error: spendErr } = await db.rpc('spend_credits', { ws: moment.workspace_id, n: 1, spend_ref: `render:${jobId}` })
  if (spendErr) throw spendErr
  if (!charged) throw new BillingError('You’re out of clip credits. Top up with a Day Pass or upgrade your plan.', 403)

  const { error } = await db.from('jobs').insert({ id: jobId, workspace_id: moment.workspace_id, type: 'render', payload: { momentId: moment.id } })
  if (error) throw error
  await db.from('moments').update({ status: 'queued' }).eq('id', moment.id)
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
  if (err instanceof PlatformError) return c.json({ error: err.message }, 400)
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
