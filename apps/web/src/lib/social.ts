import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { supabase } from './supabase'

export type SocialPlatform = 'youtube' | 'instagram' | 'facebook' | 'tiktok'

export type SocialAccount = {
  id: string
  platform: SocialPlatform
  display_name: string
  handle: string | null
  avatar_url: string | null
  status: 'active' | 'reconnect' | 'disabled'
  last_error: string | null
  meta: { pageName?: string }
  created_at: string
}

export type Publication = {
  id: string
  clip_id: string
  social_account_id: string
  platform: SocialPlatform
  title: string | null
  caption: string | null
  scheduled_at: string
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
  permalink: string | null
  error: string | null
  published_at: string | null
}

export type SocialProvider = 'google' | 'meta' | 'tiktok'

export const socialMeta: Record<
  SocialPlatform,
  { label: string; dot: string; text: string; provider: SocialProvider; maxSeconds: number }
> = {
  // maxSeconds: longest video each platform takes through its API (YouTube posts longer ones as regular videos).
  youtube: { label: 'YouTube Shorts', dot: 'bg-red-500', text: 'text-red-300', provider: 'google', maxSeconds: 12 * 3600 },
  instagram: { label: 'Instagram Reels', dot: 'bg-pink-500', text: 'text-pink-300', provider: 'meta', maxSeconds: 15 * 60 },
  facebook: { label: 'Facebook Page', dot: 'bg-blue-500', text: 'text-blue-300', provider: 'meta', maxSeconds: 4 * 3600 },
  tiktok: { label: 'TikTok', dot: 'bg-cyan-400', text: 'text-cyan-300', provider: 'tiktok', maxSeconds: 10 * 60 },
}

// Explicit column list: token columns aren't readable from the browser at all.
const ACCOUNT_COLUMNS = 'id, platform, display_name, handle, avatar_url, status, last_error, meta, created_at'

export function useSocialAccounts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['social-accounts', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_accounts')
        .select(ACCOUNT_COLUMNS)
        .eq('workspace_id', workspaceId!)
        .order('created_at')
      if (error) throw error
      return data as SocialAccount[]
    },
  })
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api<Record<SocialProvider, boolean>>('/accounts/providers'),
  })
}

export function usePublications(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['publications', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'publishing') ? 3000 : 20_000),
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data, error } = await supabase
        .from('publications')
        .select('id, clip_id, social_account_id, platform, title, caption, scheduled_at, status, permalink, error, published_at')
        .eq('workspace_id', workspaceId!)
        .gte('scheduled_at', since)
        .order('scheduled_at')
      if (error) throw error
      return data as Publication[]
    },
  })
}

export function useSocialActions(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['social-accounts'] })
    queryClient.invalidateQueries({ queryKey: ['publications'] })
  }
  return {
    connect: useMutation({
      mutationFn: (provider: SocialProvider) => api<{ url: string }>('/accounts/connect', { body: { workspaceId, provider } }),
      onSuccess: ({ url }) => window.location.assign(url),
    }),
    disconnect: useMutation({
      mutationFn: (id: string) => api(`/accounts/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    schedule: useMutation({
      mutationFn: (body: {
        clipId: string
        accountIds: string[]
        title: string
        caption: string
        scheduledAt: string
        tiktokPrivacy?: TikTokPrivacy
      }) =>
        api<{ count: number }>('/publications', { body }),
      onSuccess: refresh,
    }),
    cancel: useMutation({ mutationFn: (id: string) => api(`/publications/${id}/cancel`, { method: 'POST' }), onSuccess: refresh }),
    retry: useMutation({ mutationFn: (id: string) => api(`/publications/${id}/retry`, { method: 'POST' }), onSuccess: refresh }),
  }
}

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'

export const tiktokPrivacyOptions: { value: TikTokPrivacy; label: string }[] = [
  { value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' },
  { value: 'FOLLOWER_OF_CREATOR', label: 'Followers' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
  { value: 'SELF_ONLY', label: 'Only me' },
]

// Posting windows that tend to perform well for short-form video (local time).
const SLOTS: [number, number][] = [
  [9, 0],
  [12, 30],
  [18, 0],
  [20, 30],
]

/** Next good slot at least 15 minutes away that isn't already taken. */
export function suggestTime(taken: Date[] = []): Date {
  const earliest = Date.now() + 15 * 60 * 1000
  for (let day = 0; day < 14; day++) {
    for (const [h, m] of SLOTS) {
      const d = new Date()
      d.setDate(d.getDate() + day)
      d.setHours(h, m, 0, 0)
      if (d.getTime() < earliest) continue
      if (taken.some((t) => Math.abs(t.getTime() - d.getTime()) < 60 * 60 * 1000)) continue
      return d
    }
  }
  return new Date(earliest)
}

// <input type="datetime-local"> wants local time without a zone.
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
