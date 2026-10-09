import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth'
import { limitsFor, type PlanId } from './pricing'
import { supabase } from './supabase'

export type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  country: string | null
  currency: 'NGN' | 'GHS' | 'USD'
  onboarded: boolean
}

export type Workspace = { id: string; name: string; role: 'owner' | 'admin' | 'member' }

export type Entitlements = {
  plan_id: PlanId
  subscription_status: string | null
  period_end: string | null
  day_pass_until: string | null
  credits: number
}

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data as Profile
    },
  })
}

// For now each user works in their first workspace; a switcher arrives with agency seats.
export function useWorkspace() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['workspace', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role, workspaces(id, name)')
        .eq('user_id', user!.id)
        .order('created_at')
        .limit(1)
        .single()
      if (error) throw error
      const ws = data.workspaces as unknown as { id: string; name: string }
      return { id: ws.id, name: ws.name, role: data.role } as Workspace
    },
  })
}

export function useEntitlements(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['entitlements', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_entitlements', { ws: workspaceId }).single()
      if (error) throw error
      const e = data as Entitlements
      return { ...e, limits: limitsFor(e.plan_id) }
    },
  })
}

export type Payment = {
  reference: string
  kind: 'day_pass' | 'subscription'
  plan_id: string
  currency: 'NGN' | 'GHS' | 'USD'
  amount: number
  status: string
  paid_at: string | null
  created_at: string
}

export function usePayments(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['payments', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('reference, kind, plan_id, currency, amount, status, paid_at, created_at')
        .eq('workspace_id', workspaceId!)
        .neq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as Payment[]
    },
  })
}
