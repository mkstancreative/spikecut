import { Hono, type Context } from 'hono'
import { getPlan, type Currency } from '../src/lib/pricing'
import {
  applySuccessfulCharge,
  BillingError,
  disableSubscription,
  setSubscriptionStatus,
  startCheckout,
  upsertSubscription,
  workspaceForCustomer,
} from './billing'
import { serverEnv } from './env'
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
  if (err instanceof PaystackError) {
    console.error('[paystack]', err.status, err.message)
    return c.json({ error: `Payment provider error: ${err.message}` }, 502)
  }
  console.error(err)
  return c.json({ error: 'Something went wrong' }, 500)
})
