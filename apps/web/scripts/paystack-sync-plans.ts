/**
 * Creates (or finds) one Paystack monthly plan per paid tier × enabled currency and
 * stores the plan codes in Supabase. Safe to re-run.
 *
 *   npm run paystack:sync-plans
 */
import { plans } from '../src/lib/pricing.js'
import { serverEnv } from '../server/env.js'
import { paystack } from '../server/paystack.js'
import { supabaseAdmin } from '../server/supabase.js'

type PaystackPlan = { plan_code: string; name: string; amount: number; currency: string; interval: string }

const existing = await paystack<PaystackPlan[]>('/plan?perPage=100')
const db = supabaseAdmin()

for (const plan of plans.filter((p) => p.period === 'month')) {
  for (const currency of serverEnv.currencies) {
    const name = `SpikeCut ${plan.name} (${currency})`
    const amount = plan.price[currency] * 100
    let found = existing.find((p) => p.name === name && p.amount === amount && p.currency === currency)
    if (!found) {
      found = await paystack<PaystackPlan>('/plan', {
        method: 'POST',
        body: { name, amount, currency, interval: 'monthly', description: `${plan.limits.clips} clips per month` },
      })
      console.log(`created  ${name} → ${found.plan_code}`)
    } else {
      console.log(`exists   ${name} → ${found.plan_code}`)
    }
    const { error } = await db
      .from('paystack_plans')
      .upsert({ plan_id: plan.id, currency, amount, plan_code: found.plan_code }, { onConflict: 'plan_id,currency' })
    if (error) throw error
  }
}
console.log('Done.')
