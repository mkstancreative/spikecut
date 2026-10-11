import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useEntitlements, useWorkspace } from '@/lib/workspace'
import { FullPageSpinner } from './RequireAuth'

// There's no free tier: without an active plan or Day Pass, only Billing and Settings are reachable.
export function RequirePlan({ children }: { children: ReactNode }) {
  const workspace = useWorkspace()
  const ent = useEntitlements(workspace.data?.id)

  if (workspace.isPending || ent.isPending) return <FullPageSpinner />
  if (ent.data?.plan_id === 'free') return <Navigate to="/app/billing?required=1" replace />
  return children
}
