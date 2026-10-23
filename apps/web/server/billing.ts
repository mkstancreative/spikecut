import { getPlan, type Currency, type Plan } from '../src/lib/pricing.js'
import { serverEnv } from './env.js'
import {
  paystack,
  planCodeOf,
  type PaystackCustomer,
  type PaystackSubscription,
  type PaystackTransaction,
} from './paystack.js'
import { supabaseAdmin } from './supabase.js'

const DAY_MS = 24 * 60 * 60 * 1000
// Monthly credits stay usable for a short grace window after the renewal date,
// so a slightly late renewal charge doesn't wipe someone's balance.
const RENEWAL_GRACE_MS = 2 * DAY_MS

type CheckoutInput = { workspaceId: string; userId: string; email: string; plan: Plan; currency: Currency }

export async function startCheckout({ workspaceId, userId, email, plan, currency }: CheckoutInput) {
  const db = supabaseAdmin()
  const amount = plan.price[currency] * 100 // Paystack uses minor units
  const reference = `sc_${plan.id}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  const kind = plan.period === 'day' ? 'day_pass' : 'subscription'

  let planCode: string | undefined
  if (kind === 'subscription') {
    const { data } = await db
      .from('paystack_plans')
      .select('plan_code')
      .eq('plan_id', plan.id)
      .eq('currency', currency)
      .maybeSingle()
    if (!data) {
      throw new BillingError(`Plan ${plan.id} (${currency}) isn't set up in Paystack yet. Run npm run paystack:sync-plans.`, 503)
    }
    planCode = data.plan_code
  }

  const { error } = await db.from('payments').insert({
    workspace_id: workspaceId,
    user_id: userId,
    reference,
    kind,
    plan_id: plan.id,
    currency,
    amount,
  })
  if (error) throw error

  const init = await paystack<{ authorization_url: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: {
      email,
      amount,
      currency,
      reference,
      plan: planCode,
      callback_url: `${serverEnv.appUrl}/app/billing`,
      metadata: { workspace_id: workspaceId, plan_id: plan.id, kind },
    },
  })
  return { url: init.authorization_url, reference }
}

/**
 * Apply a successful Paystack charge. Called from both the webhook and the post-redirect
 * verify endpoint, so every write here must be idempotent.
 */
export async function applySuccessfulCharge(tx: PaystackTransaction) {
  if (tx.status !== 'success') return
  const db = supabaseAdmin()

  const { data: existing } = await db.from('payments').select('*').eq('reference', tx.reference).maybeSingle()
  let payment = existing as
    | { workspace_id: string; kind: 'day_pass' | 'subscription'; plan_id: string; amount: number; currency: string }
    | null

  // Renewal charges are created by Paystack, so there's no pending row — find the workspace by customer.
  if (!payment) {
    const planCode = planCodeOf(tx)
    if (!planCode) return console.warn('[billing] unknown one-off charge', tx.reference)
    const [{ data: ws }, { data: plan }] = await Promise.all([
      db.from('workspaces').select('id').eq('paystack_customer_code', tx.customer.customer_code).maybeSingle(),
      db.from('paystack_plans').select('plan_id').eq('plan_code', planCode).maybeSingle(),
    ])
    if (!ws || !plan) return console.warn('[billing] renewal for unknown customer/plan', tx.reference)
    payment = { workspace_id: ws.id, kind: 'subscription', plan_id: plan.plan_id, amount: tx.amount, currency: tx.currency }
    await db.from('payments').upsert(
      { ...payment, reference: tx.reference, status: 'pending' },
      { onConflict: 'reference', ignoreDuplicates: true },
    )
  }

  if (tx.amount < payment.amount || tx.currency !== payment.currency) {
    console.error('[billing] amount/currency mismatch', tx.reference, tx.amount, tx.currency)
    await db.from('payments').update({ status: 'failed' }).eq('reference', tx.reference)
    return
  }

  const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date()
  await db.from('payments').update({ status: 'success', paid_at: paidAt.toISOString() }).eq('reference', tx.reference)
  await db
    .from('workspaces')
    .update({ paystack_customer_code: tx.customer.customer_code })
    .eq('id', payment.workspace_id)
    .is('paystack_customer_code', null)

  const plan = getPlan(payment.plan_id)
  if (!plan) return console.error('[billing] unknown plan', payment.plan_id)

  if (payment.kind === 'day_pass') {
    const expiresAt = new Date(paidAt.getTime() + DAY_MS).toISOString()
    await db
      .from('day_passes')
      .upsert(
        { workspace_id: payment.workspace_id, payment_reference: tx.reference, starts_at: paidAt.toISOString(), expires_at: expiresAt },
        { onConflict: 'payment_reference', ignoreDuplicates: true },
      )
    await grantCredits(payment.workspace_id, 'day_pass', tx.reference, plan.limits.clips, expiresAt)
    return
  }

  const sub = await syncSubscriptionFromPaystack(payment.workspace_id, tx.customer, planCodeOf(tx))
  const periodEnd = sub?.next_payment_date ? new Date(sub.next_payment_date) : new Date(paidAt.getTime() + 31 * DAY_MS)
  await grantCredits(
    payment.workspace_id,
    'subscription',
    tx.reference,
    plan.limits.clips,
    new Date(periodEnd.getTime() + RENEWAL_GRACE_MS).toISOString(),
  )
  if (sub) await retireOtherSubscriptions(payment.workspace_id, sub.subscription_code)
}

async function grantCredits(workspaceId: string, source: string, ref: string, amount: number, expiresAt: string) {
  if (amount <= 0) return
  await supabaseAdmin()
    .from('credit_grants')
    .upsert(
      { workspace_id: workspaceId, source, source_ref: ref, amount, remaining: amount, expires_at: expiresAt },
      { onConflict: 'source_ref', ignoreDuplicates: true },
    )
}

// Paystack creates the subscription asynchronously after the first charge; pull its current state.
async function syncSubscriptionFromPaystack(workspaceId: string, customer: PaystackCustomer, planCode?: string) {
  const subs = await paystack<PaystackSubscription[]>(`/subscription?customer=${customer.id}&perPage=50`)
  const match = subs
    .filter((s) => !planCode || (typeof s.plan === 'object' && s.plan.plan_code === planCode))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
  if (match) await upsertSubscription(workspaceId, match)
  return match
}

export async function upsertSubscription(workspaceId: string, sub: PaystackSubscription) {
  const db = supabaseAdmin()
  const planCode = typeof sub.plan === 'object' ? sub.plan.plan_code : undefined
  const { data: plan } = planCode
    ? await db.from('paystack_plans').select('plan_id, currency').eq('plan_code', planCode).maybeSingle()
    : { data: null }
  if (!plan) return console.warn('[billing] subscription for unknown plan', sub.subscription_code)

  await db.from('subscriptions').upsert(
    {
      workspace_id: workspaceId,
      plan_id: plan.plan_id,
      currency: plan.currency,
      status: sub.status,
      paystack_subscription_code: sub.subscription_code,
      paystack_email_token: sub.email_token,
      current_period_end: sub.next_payment_date,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'paystack_subscription_code' },
  )
}

// On upgrade/downgrade the new subscription replaces the old one; stop the old one renewing.
async function retireOtherSubscriptions(workspaceId: string, keepCode: string) {
  const db = supabaseAdmin()
  const { data: others } = await db
    .from('subscriptions')
    .select('paystack_subscription_code, paystack_email_token')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .neq('paystack_subscription_code', keepCode)
  for (const s of others ?? []) {
    await disableSubscription(s.paystack_subscription_code, s.paystack_email_token).catch((e) =>
      console.error('[billing] failed to retire subscription', s.paystack_subscription_code, e),
    )
    // Old plan stops immediately; its unused credits remain until they expire.
    await db
      .from('subscriptions')
      .update({ status: 'completed', current_period_end: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('paystack_subscription_code', s.paystack_subscription_code)
  }
}

export async function disableSubscription(code: string, emailToken: string | null) {
  if (!emailToken) throw new BillingError('Subscription is missing its Paystack email token', 409)
  await paystack('/subscription/disable', { method: 'POST', body: { code, token: emailToken } })
}

export async function setSubscriptionStatus(code: string, status: string) {
  await supabaseAdmin()
    .from('subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('paystack_subscription_code', code)
}

export async function workspaceForCustomer(customerCode: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin()
    .from('workspaces')
    .select('id')
    .eq('paystack_customer_code', customerCode)
    .maybeSingle()
  return data?.id
}

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
  ) {
    super(message)
  }
}
