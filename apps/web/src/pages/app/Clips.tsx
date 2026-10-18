import { Film, LoaderCircle, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { ClipPlayer, JobProgress } from '@/components/app/ClipCard'
import { ScheduleDialog } from '@/components/app/ScheduleDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { CollapsibleSection, FoldToggle } from '@/components/ui/Collapsible'
import { Alert } from '@/components/ui/Field'
import {
  formatTimestamp,
  useActiveJobs,
  useClipActions,
  useClips,
  useMoments,
  useVideos,
  type ActiveJob,
  type AnalyzableVideo,
  type Clip,
  type Moment,
} from '@/lib/clips'
import { cn } from '@/lib/cn'
import { formatDuration, useCreators } from '@/lib/creators'
import { usePersistentState } from '@/lib/usePersistentState'
import { useEntitlements, useWorkspace } from '@/lib/workspace'

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

function MomentRow({
  moment,
  onRender,
  onDismiss,
  rendering,
  disabled,
  job,
}: {
  moment: Moment
  onRender: () => void
  onDismiss: () => void
  rendering: boolean
  disabled: boolean
  job?: ActiveJob
}) {
  const len = Math.round(moment.end_seconds - moment.start_seconds)
  return (
    <li className="flex gap-3 rounded-xl bg-ink-850 p-3">
      <ScoreBadge score={moment.score} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{moment.title}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-500">
          {formatTimestamp(moment.start_seconds)}–{formatTimestamp(moment.end_seconds)} · {len}s
        </p>
        {moment.signals.ai?.why && <p className="mt-1.5 text-xs text-ink-300">{moment.signals.ai.why}</p>}
        {!moment.signals.ai && !!moment.signals.hooks?.length && (
          <div className="mt-2 flex flex-wrap gap-1">
            {moment.signals.hooks.slice(0, 4).map((h) => (
              <span key={h} className="rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-ink-300">
                “{h}”
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center">
        {moment.status === 'detected' || moment.status === 'failed' ? (
          <>
            <ActionButton size="sm" onClick={onRender} loading={rendering} disabled={disabled}>
              <Wand2 className="size-3.5" /> {moment.status === 'failed' ? 'Retry' : 'Make clip'}
            </ActionButton>
            <button type="button" onClick={onDismiss} title="Dismiss this moment" className="rounded-lg p-2 text-ink-500 hover:bg-white/5 hover:text-ink-100">
              <X className="size-4" />
            </button>
          </>
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
  onDismiss,
  onClear,
  clearing,
  folded,
  onToggleFold,
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
  onDismiss: (momentId: string) => void
  onClear: () => void
  clearing: boolean
  folded: boolean
  onToggleFold: () => void
}) {
  const confirm = useConfirm()
  const listId = useId()
  const busy = video.analysis_status === 'queued' || video.analysis_status === 'running'
  const unused = moments.filter((m) => m.status === 'detected' || m.status === 'failed').length
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
        <div className={cn('border-t border-white/6 px-4', folded ? 'py-2.5' : 'pt-3 pb-4')}>
          <div className={cn('flex items-center justify-between gap-3', !folded && 'mb-3')}>
            <FoldToggle open={!folded} onToggle={onToggleFold} controls={listId}>
              {moments.length} moment{moments.length === 1 ? '' : 's'}
              {unused > 0 && <span className="text-ink-500">· {unused} waiting</span>}
            </FoldToggle>
            {unused > 0 && !busy && !folded && (
              <button
                type="button"
                disabled={clearing}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Clear ${unused} unused moment${unused === 1 ? '' : 's'}?`,
                    body: 'Moments you haven’t turned into clips are removed from this video. Clips you’ve made are kept.',
                    confirmLabel: 'Clear moments',
                    tone: 'danger',
                  })
                  if (ok) onClear()
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ink-400 hover:bg-cut/10 hover:text-cut disabled:opacity-50"
              >
                {clearing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Clear unused
              </button>
            )}
          </div>
          {!folded && (
          <ul id={listId} className="space-y-2">
            {moments.map((m) => (
              <MomentRow
                key={m.id}
                moment={m}
                onRender={() => onRender(m.id)}
                onDismiss={() => onDismiss(m.id)}
                rendering={renderingId === m.id}
                disabled={outOfCredits}
                job={jobs.get(m.id)}
              />
            ))}
          </ul>
          )}
        </div>
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
  const clips = useClips(wsId, 'standard')
  const jobs = useActiveJobs(wsId)
  const [publishing, setPublishing] = useState<Clip | null>(null)
  // Fold state is remembered per browser.
  const [clipsOpen, setClipsOpen] = usePersistentState('spikecut:clips:open', true)
  const [scanOpen, setScanOpen] = usePersistentState('spikecut:scan:open', true)
  const [foldedVideos, setFoldedVideos] = usePersistentState<string[]>('spikecut:scan:folded', [])
  const toggleVideo = (id: string) =>
    setFoldedVideos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const { analyze, render, deleteClip, dismissMoment, clearMoments } = useClipActions()

  const creatorName = new Map(creators.data?.map((c) => [c.id, c.display_name]))
  const momentById = new Map(moments.data?.map((m) => [m.id, m]))
  const momentsByVideo = new Map<string, Moment[]>()
  for (const m of moments.data ?? []) momentsByVideo.set(m.stream_id, [...(momentsByVideo.get(m.stream_id) ?? []), m])
  const outOfCredits = (ent.data?.credits ?? 0) < 1
  const videosWithMoments = (videos.data ?? []).filter((v) => momentsByVideo.has(v.id)).map((v) => v.id)
  const allFolded = videosWithMoments.length > 0 && videosWithMoments.every((id) => foldedVideos.includes(id))
  const error = (analyze.error ?? render.error ?? deleteClip.error ?? dismissMoment.error ?? clearMoments.error) as Error | null

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
          <CollapsibleSection title="Your clips" count={clips.data.length} open={clipsOpen} onToggle={() => setClipsOpen(!clipsOpen)}>
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {clips.data.map((c) => (
                <li key={c.id}>
                  <ClipPlayer
                    clip={c}
                    title={momentById.get(c.moment_id)?.title}
                    job={jobs.get(c.moment_id)}
                    onPublish={() => setPublishing(c)}
                    onDelete={() => deleteClip.mutate(c.id)}
                    deleting={deleteClip.isPending && deleteClip.variables === c.id}
                  />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Find moments"
          count={videos.data?.length}
          open={scanOpen}
          onToggle={() => setScanOpen(!scanOpen)}
          description="SpikeCut transcribes the video and scores every stretch for energy, hooks and pace. Finding moments is free — each clip you make uses 1 credit."
          actions={
            scanOpen &&
            videosWithMoments.length > 0 && (
              <button
                type="button"
                onClick={() => setFoldedVideos(allFolded ? [] : videosWithMoments)}
                className="rounded-lg px-2 py-1 text-xs text-ink-400 hover:bg-white/5 hover:text-ink-100"
              >
                {allFolded ? 'Expand all moments' : 'Collapse all moments'}
              </button>
            )
          }
        >
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
                  onDismiss={(id) => dismissMoment.mutate(id)}
                  onClear={() => clearMoments.mutate(v.id)}
                  clearing={clearMoments.isPending && clearMoments.variables === v.id}
                  folded={foldedVideos.includes(v.id)}
                  onToggleFold={() => toggleVideo(v.id)}
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
        </CollapsibleSection>
      </div>
    </>
  )
}
