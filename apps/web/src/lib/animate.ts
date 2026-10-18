import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Upload } from 'tus-js-client'
import { api } from './api'
import type { CartoonStyleId } from './animatePresets'
import type { AnalyzableVideo } from './clips'
import { env } from './env'
import { supabase } from './supabase'

export type UploadedVideo = AnalyzableVideo & { source_path: string | null; created_at: string }

/** Whether the server has a fal.ai key for the AI styles (the Light filter always works). */
export function useCartoonEngines() {
  return useQuery({
    queryKey: ['cartoon-engines'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api<{ local: boolean; fal: boolean }>('/cartoon/engines'),
  })
}

/** Read a video's length in the browser before uploading, so the cost can be shown up front. */
export function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => done(null) // e.g. MKV in Safari — the worker still checks the length
    video.src = url
  })
}

const busy = (v: UploadedVideo) => v.analysis_status === 'queued' || v.analysis_status === 'running'

export function useUploads(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['uploads', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (q) => (q.state.data?.some(busy) ? 2000 : 30_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('streams')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('kind', 'upload')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as UploadedVideo[]
    },
  })
}

// Supabase's resumable endpoint requires exactly 6 MB chunks.
const CHUNK = 6 * 1024 * 1024

/** Resumable upload straight to Storage — survives flaky connections and files far bigger than the API allows. */
async function sendToStorage(file: File, path: string, onProgress: (pct: number) => void) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Session expired — please sign in again')
  const token = data.session.access_token
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10_000, 20_000],
      headers: { authorization: `Bearer ${token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK,
      metadata: { bucketName: 'uploads', objectName: path, contentType: file.type || 'video/mp4', cacheControl: '3600' },
      onError: (e) => {
        const body = (e as { originalResponse?: { getBody(): string } }).originalResponse?.getBody()
        reject(new Error(body ? `Upload failed: ${body.slice(0, 200)}` : e.message))
      },
      onProgress: (sent, total) => onProgress((sent / total) * 100),
      onSuccess: () => resolve(),
    })
    // Pick up where a previous attempt at this same file left off.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })
  })
}

export function useAnimateActions(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const refresh = () => {
    for (const key of ['uploads', 'moments', 'clips', 'entitlements', 'jobs']) queryClient.invalidateQueries({ queryKey: [key] })
  }
  return {
    uploadPct,
    upload: useMutation({
      mutationFn: async ({ file, style, details }: { file: File; style: CartoonStyleId; details: string }) => {
        const ext = file.name.match(/\.[a-z0-9]{2,5}$/i)?.[0].toLowerCase() ?? '.mp4'
        const path = `${workspaceId}/${crypto.randomUUID()}${ext}`
        setUploadPct(0)
        try {
          await sendToStorage(file, path, setUploadPct)
        } finally {
          setUploadPct(null)
        }
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
        return api<{ id: string }>('/uploads', { body: { workspaceId, path, title, style, details } })
      },
      onSuccess: refresh,
    }),
    fromLink: useMutation({
      mutationFn: ({ url, style, details }: { url: string; style: CartoonStyleId; details: string }) =>
        api<{ id: string }>('/uploads/link', { body: { workspaceId, url, style, details } }),
      onSuccess: refresh,
    }),
    retry: useMutation({ mutationFn: (id: string) => api(`/uploads/${id}/retry`, { method: 'POST' }), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api(`/uploads/${id}`, { method: 'DELETE' }), onSuccess: refresh }),
  }
}
