import { limitsFor, type Limits, type PlanId } from '../src/lib/pricing.js'
import { supabaseAdmin } from './supabase.js'

export type ServerEntitlements = { planId: PlanId; credits: number; limits: Limits }

export async function getEntitlements(workspaceId: string): Promise<ServerEntitlements> {
  const { data, error } = await supabaseAdmin().rpc('get_entitlements', { ws: workspaceId }).single()
  if (error) throw error
  const e = data as { plan_id: PlanId; credits: number }
  return { planId: e.plan_id, credits: e.credits, limits: limitsFor(e.plan_id) }
}
