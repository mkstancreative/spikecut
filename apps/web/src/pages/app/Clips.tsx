import { AlertTriangle, Download, Film, LoaderCircle, Send, Sparkles, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { ScheduleDialog } from '@/components/app/ScheduleDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import {
  formatTimestamp,
  useActiveJobs,
  useClipActions,
  useClips,
  useMoments,
  useSignedUrl,
  useVideos,
  type ActiveJob,
  type AnalyzableVideo,
  type Clip,
  type Moment,
} from '@/lib/clips'
import { cn } from '@/lib/cn'
import { formatDuration, useCreators } from '@/lib/creators'
import { useEntitlements, useWorkspace } from '@/lib/workspace'

function JobProgress({ job, fallback }: { job?: ActiveJob; fallback?: string | null }) {
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

function ClipPlayer({ clip, title, job, onPublish }: { clip: Clip; title?: string | null; job?: ActiveJob; onPublish: () => void }) {
  const video = useSignedUrl(clip.status === 'ready' ? clip.video_path : null)
  const poster = useSignedUrl(clip.status === 'ready' ? clip.thumbnail_path : null)
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-9/16 bg-ink-850">
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
      </div>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        'inline-flex w-11 shrink-0 flex-col items-center rounded-lg py-1 font-mono',
        score >= 80 ? 'bg-spike/15 text-spike' : score >= 60 ? 'bg-signal/15 text-signal' : 'bg-white/6 text-ink-300',
      )}
    >
      <span className="text-base leading-none font-bold">{score}</span>
      <span className="text-[9px] tracking-wider uppercase opacity-70">score</span>
    </span>
  )
}

function MomentRow({ moment, onRender, rendering, disabled, job }: { moment: Moment; onRender: () => void; rendering: boolean; disabled: boolean; job?: ActiveJob }) {
  const len = Math.round(moment.end_seconds - moment.start_seconds)
  return (
    <li className="flex gap-3 rounded-xl bg-ink-850 p-3">
      <ScoreBadge score={moment.score} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{moment.title}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-500">
          {formatTimestamp(moment.start_seconds)}–{formatTimestamp(moment.end_seconds)} · {len}s
        </p>
        {!!moment.signals.hooks?.length && (
          <div className="mt-2 flex flex-wrap gap-1">
            {moment.signals.hooks.slice(0, 4).map((h) => (
              <span key={h} className="rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-ink-300">
                “{h}”
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 self-center">
        {moment.status === 'detected' || moment.status === 'failed' ? (
          <ActionButton size="sm" onClick={onRender} loading={rendering} disabled={disabled}>
            <Wand2 className="size-3.5" /> {moment.status === 'failed' ? 'Retry' : 'Make clip'}
          </ActionButton>
        ) : moment.status === 'rendered' ? (
          <span className="text-xs text-spike">Clip ready ↑</span>
        ) : (
          <div className="w-40">
            <JobProgress job={job} fallback={moment.status === 'queued' ? 'Queued' : 'Rendering'} />
          </div>
        )}
      </div>
    </li>
  )
}

function VideoRow({
  video,
  creatorName,
  moments,
  onAnalyze,
  analyzing,
  onRender,
  renderingId,
  outOfCredits,
  jobs,
}: {
  video: AnalyzableVideo
  creatorName?: string
  moments: Moment[]
  onAnalyze: () => void
  analyzing: boolean
  onRender: (id: string) => void
  renderingId?: string
  outOfCredits: boolean
  jobs: Map<string, ActiveJob>
}) {
  const busy = video.analysis_status === 'queued' || video.analysis_status === 'running'
  return (
    <li className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <a href={video.url} target="_blank" rel="noreferrer" className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-ink-850 sm:w-44">
          {video.thumbnail_url && <img src={video.thumbnail_url} alt="" loading="lazy" className="size-full object-cover" />}
          {video.duration_seconds ? (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
              {formatDuration(video.duration_seconds)}
            </span>
          ) : null}
        </a>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium">{video.title}</p>
          <p className="mt-1 text-xs text-ink-500">{creatorName}</p>
          {busy ? (
            <div className="mt-3 max-w-md">
              <JobProgress job={jobs.get(video.id)} fallback={video.analysis_message} />
            </div>
          ) : video.analysis_status && video.analysis_status !== 'none' && (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 text-xs',
                video.analysis_status === 'failed' ? 'text-cut' : video.analysis_status === 'done' ? 'text-spike' : 'text-signal',
              )}
            >
              {video.analysis_message}
            </p>
          )}
        </div>
        {!busy && (
          <ActionButton
            size="sm"
            variant={video.analysis_status === 'done' ? 'secondary' : 'primary'}
            onClick={onAnalyze}
            loading={analyzing}
            className="shrink-0"
          >
            <Sparkles className="size-3.5" />
            {video.analysis_status === 'done' || video.analysis_status === 'failed' ? 'Re-scan' : 'Find moments'}
          </ActionButton>
        )}
      </div>
      {!!moments.length && (
        <ul className="space-y-2 border-t border-white/6 p-4">
          {moments.map((m) => (
            <MomentRow key={m.id} moment={m} onRender={() => onRender(m.id)} rendering={renderingId === m.id} disabled={outOfCredits} job={jobs.get(m.id)} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Clips() {
  const workspace = useWorkspace()
  const wsId = workspace.data?.id
  const ent = useEntitlements(wsId)
  const creators = useCreators(wsId)
  const videos = useVideos(wsId)
  const moments = useMoments(wsId)
  const clips = useClips(wsId)
  const jobs = useActiveJobs(wsId)
  const [publishing, setPublishing] = useState<Clip | null>(null)
  const { analyze, render } = useClipActions()

  const creatorName = new Map(creators.data?.map((c) => [c.id, c.display_name]))
  const momentById = new Map(moments.data?.map((m) => [m.id, m]))
  const momentsByVideo = new Map<string, Moment[]>()
  for (const m of moments.data ?? []) momentsByVideo.set(m.stream_id, [...(momentsByVideo.get(m.stream_id) ?? []), m])
  const outOfCredits = (ent.data?.credits ?? 0) < 1
  const error = (analyze.error ?? render.error) as Error | null

  return (
    <>
      <PageHeader
        title="Clips"
        description={`Find the best moments in your creators’ videos and turn them into vertical clips · ${ent.data?.credits ?? '—'} credits left`}
      />
      <div className="space-y-10 p-4 sm:p-8">
        {publishing && wsId && (
          <ScheduleDialog
            clipId={publishing.id}
            workspaceId={wsId}
            defaultTitle={momentById.get(publishing.moment_id)?.title ?? ''}
            onClose={() => setPublishing(null)}
          />
        )}
        {error && <Alert>{error.message}</Alert>}
        {outOfCredits && ent.data && (
          <Alert tone="info">
            You’re out of clip credits. <a href="/app/billing" className="underline">Top up or upgrade</a> to make more clips.
          </Alert>
        )}

        {!!clips.data?.length && (
          <section>
            <h2 className="font-display text-xl font-bold">Your clips</h2>
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {clips.data.map((c) => (
                <li key={c.id}>
                  <ClipPlayer clip={c} title={momentById.get(c.moment_id)?.title} job={jobs.get(c.moment_id)} onPublish={() => setPublishing(c)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-xl font-bold">Find moments</h2>
          <p className="mt-1 text-sm text-ink-400">
            SpikeCut transcribes the video and scores every stretch for energy, hooks and pace. Finding moments is free — each clip
            you make uses 1 credit.
          </p>
          {videos.data?.length ? (
            <ul className="mt-4 space-y-4">
              {videos.data.map((v) => (
                <VideoRow
                  key={v.id}
                  video={v}
                  creatorName={creatorName.get(v.creator_id)}
                  moments={momentsByVideo.get(v.id) ?? []}
                  onAnalyze={() => analyze.mutate(v.id)}
                  analyzing={analyze.isPending && analyze.variables === v.id}
                  onRender={(id) => render.mutate(id)}
                  renderingId={render.isPending ? render.variables : undefined}
                  outOfCredits={outOfCredits}
                  jobs={jobs}
                />
              ))}
            </ul>
          ) : (
            !videos.isPending && (
              <div className="mt-4">
                <EmptyState
                  icon={Film}
                  title="No videos to clip yet"
                  body="Add a creator and their latest videos and past streams will appear here, ready to scan for moments."
                  action={<Button to="/app/creators">Add a creator</Button>}
                />
              </div>
            )
          )}
        </section>
      </div>
    </>
  )
}
