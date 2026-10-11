import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { supabase } from './supabase'

export type Creator = {
  id: string
  platform: 'youtube' | 'twitch' | 'kick'
  channel_id: string
  handle: string | null
  display_name: string
  avatar_url: string | null
  channel_url: string
  is_live: boolean
  last_checked_at: string | null
  last_error: string | null
  created_at: string
}

export type Stream = {
  id: string
  creator_id: string
  platform: Creator['platform']
  external_id: string
  kind: 'live' | 'vod' | 'upload'
  status: 'live' | 'upcoming' | 'ended' | 'available'
  title: string | null
  thumbnail_url: string | null
  url: string
  viewer_count: number | null
  duration_seconds: number | null
  started_at: string | null
  published_at: string | null
}

// Polling keeps the dashboard in step with the background monitor.
const REFRESH_MS = 30_000

export function useCreators(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['creators', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creators')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at')
      if (error) throw error
      return data as Creator[]
    },
  })
}

export function useStreams(workspaceId: string | undefined, opts: { live?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: ['streams', workspaceId, opts],
    enabled: !!workspaceId,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      let q = supabase.from('streams').select('*').eq('workspace_id', workspaceId!)
      q = opts.live ? q.eq('status', 'live') : q.neq('status', 'live')
      const { data, error } = await q.order('published_at', { ascending: false }).limit(opts.limit ?? 50)
      if (error) throw error
      return data as Stream[]
    },
  })
}

export function useCreatorActions(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['creators'] })
    queryClient.invalidateQueries({ queryKey: ['streams'] })
  }
  return {
    add: useMutation({
      mutationFn: (url: string) => api('/creators', { body: { workspaceId, url } }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/creators/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
    refresh: useMutation({
      mutationFn: (id: string) => api(`/creators/${id}/refresh`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
  }
}

export const platformMeta: Record<Creator['platform'], { label: string; dot: string }> = {
  youtube: { label: 'YouTube', dot: 'bg-red-500' },
  twitch: { label: 'Twitch', dot: 'bg-violet-400' },
  kick: { label: 'Kick', dot: 'bg-lime-400' },
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const secs = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const abs = Math.abs(secs)
  if (abs < 60) return rtf.format(secs, 'second')
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour')
  return rtf.format(Math.round(secs / 86400), 'day')
}

export function formatDuration(secs: number | null): string {
  if (!secs) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
