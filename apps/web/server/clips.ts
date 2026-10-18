import { BillingError } from './billing'
import { supabaseAdmin } from './supabase'

/** Give credits back (e.g. after a failed render). `ref` makes it safe to call twice. */
export async function refundCredits(workspaceId: string, amount: number, ref: string) {
  const db = supabaseAdmin()
  // Refunds expire with the workspace's latest grant, or in a day if it has none left.
  const { data: grants } = await db
    .from('credit_grants')
    .select('expires_at')
    .eq('workspace_id', workspaceId)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
  const expires = grants?.[0]?.expires_at ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  await db.from('credit_grants').upsert(
    { workspace_id: workspaceId, source: 'refund', source_ref: ref, amount, remaining: amount, expires_at: expires },
    { onConflict: 'source_ref', ignoreDuplicates: true },
  )
}

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
