import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Stream } from './creators'
import { supabase } from './supabase'

export type AnalyzableVideo = Stream & {
  analysis_status: 'none' | 'queued' | 'running' | 'done' | 'failed'
  analysis_message: string | null
}

export type Moment = {
  id: string
  stream_id: string
  start_seconds: number
  end_seconds: number
  score: number
  title: string | null
  transcript: string | null
  signals: { hooks?: string[]; loudness?: number; pace?: number; ai?: { score: number; why: string }; whole?: boolean }
  status: 'detected' | 'queued' | 'rendering' | 'rendered' | 'failed'
}

export type Clip = {
  id: string
  moment_id: string
  stream_id: string
  video_path: string | null
  thumbnail_path: string | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  style: 'standard' | 'animated' | 'cartoon'
  preset: string | null
  status: 'rendering' | 'ready' | 'failed'
  error: string | null
  created_at: string
}

export type ActiveJob = {
  id: string
  type: 'analyze' | 'render'
  status: 'queued' | 'running'
  progress: number
  message: string | null
  payload: { streamId?: string; momentId?: string }
}

/** Jobs the worker is on (or about to start), keyed by the video or moment they belong to. */
export function useActiveJobs(workspaceId: string | undefined) {
  const query = useQuery({
    queryKey: ['jobs', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.length ? 1500 : 10_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, type, status, progress, message, payload')
        .eq('workspace_id', workspaceId!)
        .in('status', ['queued', 'running'])
        .order('created_at')
      if (error) throw error
      return data as ActiveJob[]
    },
  })
  const byTarget = new Map<string, ActiveJob>()
  for (const job of query.data ?? []) {
    const key = job.payload.streamId ?? job.payload.momentId
    if (key) byTarget.set(key, job)
  }
  return byTarget
}

const busy = (v: AnalyzableVideo) => v.analysis_status === 'queued' || v.analysis_status === 'running'

// Poll quickly while the worker is busy, slowly otherwise.
export function useVideos(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['videos', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.some(busy) ? 3000 : 30_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('streams')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .in('status', ['available', 'ended'])
        .neq('kind', 'upload') // the user's own uploads live on the Animate page
        .or('duration_seconds.is.null,duration_seconds.gte.60')
        .order('published_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data as AnalyzableVideo[]
    },
  })
}

export function useMoments(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['moments', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === 'queued' || m.status === 'rendering') ? 3000 : 15_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('moments')
        .select('id, stream_id, start_seconds, end_seconds, score, title, transcript, signals, status')
        .eq('workspace_id', workspaceId!)
        .order('score', { ascending: false })
      if (error) throw error
      return data as Moment[]
    },
  })
}

/** All clips, or only one style (Clips shows standard renders, Animate shows animated ones). */
export function useClips(workspaceId: string | undefined, style?: Clip['style']) {
  return useQuery({
    queryKey: ['clips', workspaceId, style],
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === 'rendering') ? 3000 : 15_000),
    queryFn: async () => {
      let query = supabase.from('clips').select('*').eq('workspace_id', workspaceId!)
      if (style) query = query.eq('style', style)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data as Clip[]
    },
  })
}

// Clips live in a private bucket; members get short-lived signed URLs.
export function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ['signed', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('clips').createSignedUrl(path!, 60 * 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export function useClipActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    for (const key of ['videos', 'moments', 'clips', 'entitlements', 'jobs']) queryClient.invalidateQueries({ queryKey: [key] })
  }
  return {
    analyze: useMutation({ mutationFn: (streamId: string) => api(`/streams/${streamId}/analyze`, { method: 'POST' }), onSuccess: refresh }),
    stopAnalyze: useMutation({ mutationFn: (streamId: string) => api(`/streams/${streamId}/analyze/stop`, { method: 'POST' }), onSuccess: refresh }),
    render: useMutation({ mutationFn: (momentId: string) => api(`/moments/${momentId}/render`, { method: 'POST' }), onSuccess: refresh }),
    deleteClip: useMutation({ mutationFn: (clipId: string) => api(`/clips/${clipId}`, { method: 'DELETE' }), onSuccess: refresh }),
    dismissMoment: useMutation({ mutationFn: (momentId: string) => api(`/moments/${momentId}`, { method: 'DELETE' }), onSuccess: refresh }),
    clearMoments: useMutation({
      mutationFn: (streamId: string) => api<{ removed: number }>(`/streams/${streamId}/moments`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  }
}

export function formatTimestamp(secs: number) {
  const s = Math.floor(secs)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
