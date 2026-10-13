import { BillingError } from './billing'
import { supabaseAdmin } from './supabase'

/**
 * Reserve 1 credit and queue a render for a moment. The worker refunds the credit if rendering fails.
 * Used by the "Make clip" button and by live auto-clipping.
 */
export async function queueRender(workspaceId: string, momentId: string) {
  const db = supabaseAdmin()
  const jobId = crypto.randomUUID()
  const { data: charged, error: spendErr } = await db.rpc('spend_credits', { ws: workspaceId, n: 1, spend_ref: `render:${jobId}` })
  if (spendErr) throw spendErr
  if (!charged) throw new BillingError('You’re out of clip credits. Top up with a Day Pass or upgrade your plan.', 403)

  const { error } = await db.from('jobs').insert({ id: jobId, workspace_id: workspaceId, type: 'render', payload: { momentId } })
  if (error) throw error
  await db.from('moments').update({ status: 'queued' }).eq('id', momentId)
  return jobId
}
