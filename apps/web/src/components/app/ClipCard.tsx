import { AlertTriangle, Download, LoaderCircle, Send, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useSignedUrl, type ActiveJob, type Clip } from '@/lib/clips'
import { cn } from '@/lib/cn'

// Shared by Clips and Animate.

export function JobProgress({ job, fallback }: { job?: ActiveJob; fallback?: string | null }) {
  const pct = job?.status === 'running' ? Math.max(1, Math.round(job.progress)) : 0
  const label = job?.status === 'queued' ? 'Waiting for the worker' : (job?.message ?? fallback ?? 'Starting')
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-signal">
          <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
          <span className="truncate">{label}</span>
        </span>
        {job?.status === 'running' && <span className="shrink-0 font-mono text-ink-300">{pct}%</span>}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className={cn('h-full rounded-full bg-spike transition-[width] duration-700 ease-out', job?.status !== 'running' && 'w-1/4 animate-pulse bg-white/20')}
          style={job?.status === 'running' ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  )
}

export function ClipPlayer({
  clip,
  title,
  job,
  onPublish,
  onDelete,
  deleting,
  badge,
}: {
  clip: Clip
  title?: string | null
  badge?: ReactNode
  job?: ActiveJob
  onPublish: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const confirm = useConfirm()
  const video = useSignedUrl(clip.status === 'ready' ? clip.video_path : null)
  const poster = useSignedUrl(clip.status === 'ready' ? clip.thumbnail_path : null)
  // Animated whole videos keep their own shape; everything else is 9:16.
  const ratio = clip.width && clip.height ? `${clip.width} / ${clip.height}` : '9 / 16'
  return (
    <div className="card overflow-hidden">
      <div className="relative bg-ink-850" style={{ aspectRatio: ratio }}>
        {clip.status === 'ready' && video.data ? (
          <video src={video.data} poster={poster.data} controls playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
        ) : clip.status === 'failed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-cut">
            <AlertTriangle className="size-6" />
            Render failed — your credit was refunded.
            {clip.error && <span className="line-clamp-3 text-xs text-ink-500">{clip.error}</span>}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <span className="font-display text-3xl font-bold text-spike">{job?.status === 'running' ? `${Math.round(job.progress)}%` : '…'}</span>
            <JobProgress job={job} fallback="Rendering" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 p-3">
        <p className="min-w-0 flex-1 truncate text-sm">{title ?? 'Clip'}</p>
        {badge}
        {clip.status === 'ready' && (
          <button type="button" onClick={onPublish} className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-spike" title="Publish or schedule">
            <Send className="size-4" />
          </button>
        )}
        {video.data && (
          <a href={video.data} download className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-spike" title="Download">
            <Download className="size-4" />
          </a>
        )}
        {clip.status !== 'rendering' && (
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              const ok = await confirm({
                title: 'Delete this clip?',
                body: 'The video is removed from storage and any scheduled posts for it are cancelled. The credit used to make it isn’t refunded.',
                confirmLabel: 'Delete clip',
                tone: 'danger',
              })
              if (ok) onDelete()
            }}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-cut/10 hover:text-cut disabled:opacity-50"
            title="Delete clip"
          >
            {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        )}
      </div>
    </div>
  )
}
