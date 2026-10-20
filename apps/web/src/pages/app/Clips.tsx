import { Film, Link2, LoaderCircle, Sparkles, Square, Trash2, UploadCloud, Wand2, X } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ClipPlayer, JobProgress } from '@/components/app/ClipCard'
import { ScheduleDialog } from '@/components/app/ScheduleDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { CollapsibleSection, FoldToggle } from '@/components/ui/Collapsible'
import { Alert, inputClasses } from '@/components/ui/Field'
import { useUploads, useVideoActions, type UploadedVideo } from '@/lib/animate'
import { MAX_CARTOON_SECONDS } from '@/lib/animatePresets'
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
  onStop,
  stopping,
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
  cartoon,
  onCartoonify,
  onDelete,
  deleting,
}: {
  video: AnalyzableVideo
  creatorName?: string
  moments: Moment[]
  onAnalyze: () => void
  onStop: () => void
  stopping: boolean
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
  cartoon?: UploadedVideo
  onCartoonify: () => void
  onDelete?: () => void
  deleting: boolean
}) {
  const confirm = useConfirm()
  const listId = useId()
  const busy = video.analysis_status === 'queued' || video.analysis_status === 'running'
  const unused = moments.filter((m) => m.status === 'detected' || m.status === 'failed').length
  const secs = video.duration_seconds
  const tooShort = secs != null && secs < 60
  const tooLong = secs != null && secs > MAX_CARTOON_SECONDS
  const cartooning = cartoon?.analysis_status === 'queued' || cartoon?.analysis_status === 'running'
  return (
    <li className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <a
          // Uploaded files live in private storage — only links open anywhere.
          href={video.source_path ? undefined : video.url}
          target="_blank"
          rel="noreferrer"
          className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-850 sm:w-44"
        >
          {video.thumbnail_url ? (
            <img src={video.thumbnail_url} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Film className="size-6 text-ink-600" />
          )}
          {video.duration_seconds ? (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
              {formatDuration(video.duration_seconds)}
            </span>
          ) : null}
        </a>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium">{video.title}</p>
          <p className="mt-1 text-xs text-ink-500">{creatorName}</p>
          {cartoon && (
            <p className={cn('mt-1.5 text-xs', cartoon.analysis_status === 'failed' ? 'text-cut' : cartoon.analysis_status === 'done' ? 'text-spike' : 'text-signal')}>
              <Wand2 className="mr-1 inline size-3" />
              Cartoon: {cartoon.analysis_message ?? 'Waiting for the worker'} ·{' '}
              <Link to="/app/animate" className="underline">
                {cartoon.analysis_status === 'done' ? 'see it' : 'details'}
              </Link>
            </p>
          )}
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {busy ? (
            <ActionButton size="sm" variant="secondary" onClick={onStop} loading={stopping} className="text-cut">
              <Square className="size-3" /> Stop
            </ActionButton>
          ) : (
            <ActionButton
              size="sm"
              variant={video.analysis_status === 'done' ? 'secondary' : 'primary'}
              onClick={onAnalyze}
              loading={analyzing}
              disabled={tooShort}
              title={tooShort ? 'Under a minute — too short to find moments in' : 'Find the best moments and make clips'}
            >
              <Sparkles className="size-3.5" />
              {video.analysis_status === 'done' || video.analysis_status === 'failed' ? 'Re-scan' : 'Find moments'}
            </ActionButton>
          )}
          <ActionButton
            size="sm"
            variant="secondary"
            onClick={onCartoonify}
            disabled={tooLong || cartooning}
            title={tooLong ? `Longer than ${MAX_CARTOON_SECONDS / 60} minutes — too long to cartoonify` : 'Turn this video into a cartoon'}
          >
            <Wand2 className="size-3.5" /> Cartoonify
          </ActionButton>
          {onDelete && (
            <button
              type="button"
              disabled={deleting || busy}
              title="Delete this video"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete this video?',
                  body: 'The video, its moments, clips and cartoons are removed from your workspace.',
                  confirmLabel: 'Delete video',
                  tone: 'danger',
                })
                if (ok) onDelete()
              }}
              className="rounded-lg p-2 text-ink-500 hover:bg-cut/10 hover:text-cut disabled:opacity-50"
            >
              {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          )}
        </div>
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

/** Add one of your own videos to the library — a file from your device or a link to a public post. */
function AddVideo({ workspaceId }: { workspaceId: string }) {
  const { addFile, addLink, uploadPct } = useVideoActions(workspaceId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [link, setLink] = useState('')
  const error = (addFile.error ?? addLink.error) as Error | null

  function submitLink(e: FormEvent) {
    e.preventDefault()
    if (link.trim()) addLink.mutate(link.trim(), { onSuccess: () => setLink('') })
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="card flex flex-col gap-2 p-3 sm:flex-row">
        <form onSubmit={submitLink} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a link — TikTok, Instagram, YouTube, X…"
              aria-label="Video link"
              className={cn(inputClasses, 'pl-9')}
            />
          </div>
          <ActionButton type="submit" variant="secondary" loading={addLink.isPending} disabled={!link.trim()}>
            Add
          </ActionButton>
        </form>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) addFile.mutate(file)
          }}
        />
        <ActionButton variant="secondary" loading={addFile.isPending} onClick={() => fileInput.current?.click()}>
          <UploadCloud className="size-4" />
          {uploadPct != null ? `Uploading · ${Math.round(uploadPct)}%` : 'Upload a video'}
        </ActionButton>
      </div>
      {error && <Alert>{error.message}</Alert>}
    </div>
  )
}

type Filter = 'all' | 'creators' | 'mine'
const filters: [Filter, string][] = [
  ['all', 'All'],
  ['creators', 'Creators'],
  ['mine', 'My uploads'],
]

export default function Clips() {
  const workspace = useWorkspace()
  const wsId = workspace.data?.id
  const ent = useEntitlements(wsId)
  const creators = useCreators(wsId)
  const videos = useVideos(wsId)
  const moments = useMoments(wsId)
  const clips = useClips(wsId, 'standard')
  const jobs = useActiveJobs(wsId)
  const cartoons = useUploads(wsId)
  const { remove } = useVideoActions(wsId)
  const [publishing, setPublishing] = useState<Clip | null>(null)
  const navigate = useNavigate()
  const [filter, setFilter] = usePersistentState<Filter>('spikecut:videos:filter', 'all')
  // Fold state is remembered per browser.
  const [clipsOpen, setClipsOpen] = usePersistentState('spikecut:clips:open', true)
  const [scanOpen, setScanOpen] = usePersistentState('spikecut:scan:open', true)
  const [foldedVideos, setFoldedVideos] = usePersistentState<string[]>('spikecut:scan:folded', [])
  const toggleVideo = (id: string) =>
    setFoldedVideos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const { analyze, stopAnalyze, render, deleteClip, dismissMoment, clearMoments } = useClipActions()

  const creatorName = new Map(creators.data?.map((c) => [c.id, c.display_name]))
  // Newest cartoon per source video (the list is newest first).
  const cartoonBySource = new Map<string, UploadedVideo>()
  for (const t of cartoons.data ?? []) if (t.source_stream_id && !cartoonBySource.has(t.source_stream_id)) cartoonBySource.set(t.source_stream_id, t)
  const shown = (videos.data ?? []).filter((v) => (filter === 'all' ? true : filter === 'creators' ? !!v.creator_id : !v.creator_id))
  const momentById = new Map(moments.data?.map((m) => [m.id, m]))
  const momentsByVideo = new Map<string, Moment[]>()
  for (const m of moments.data ?? []) momentsByVideo.set(m.stream_id, [...(momentsByVideo.get(m.stream_id) ?? []), m])
  const outOfCredits = (ent.data?.credits ?? 0) < 1
  const videosWithMoments = (videos.data ?? []).filter((v) => momentsByVideo.has(v.id)).map((v) => v.id)
  const allFolded = videosWithMoments.length > 0 && videosWithMoments.every((id) => foldedVideos.includes(id))
  const error = (analyze.error ?? stopAnalyze.error ?? render.error ?? deleteClip.error ?? dismissMoment.error ?? clearMoments.error ?? remove.error) as Error | null

  return (
    <>
      <PageHeader
        title="Clips"
        description={`All your videos in one place — find the best moments for clips, or cartoonify them · ${ent.data?.credits ?? '—'} credits left`}
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
          title="Your videos"
          count={videos.data?.length}
          open={scanOpen}
          onToggle={() => setScanOpen(!scanOpen)}
          description="Find moments: SpikeCut transcribes the video and scores every stretch for energy, hooks and pace — free, then each clip you make uses 1 credit. Cartoonify: redraws the whole video in a style you pick."
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
          {wsId && <AddVideo workspaceId={wsId} />}
          {!!videos.data?.length && (
            <div role="tablist" aria-label="Show videos from" className="mt-4 inline-flex rounded-xl border border-white/10 p-1">
              {filters.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={cn('rounded-lg px-3 py-1.5 text-sm', filter === id ? 'bg-spike/15 text-spike' : 'text-ink-400 hover:text-ink-100')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {shown.length ? (
            <ul className="mt-4 space-y-4">
              {shown.map((v) => (
                <VideoRow
                  key={v.id}
                  video={v}
                  creatorName={v.creator_id ? creatorName.get(v.creator_id) : v.source_path ? 'Your upload' : 'Pasted link'}
                  cartoon={cartoonBySource.get(v.id)}
                  onCartoonify={() => navigate(`/app/animate?video=${v.id}`)}
                  onDelete={v.creator_id ? undefined : () => remove.mutate(v.id)}
                  deleting={remove.isPending && remove.variables === v.id}
                  moments={momentsByVideo.get(v.id) ?? []}
                  onAnalyze={() => analyze.mutate(v.id)}
                  onStop={() => stopAnalyze.mutate(v.id)}
                  stopping={stopAnalyze.isPending && stopAnalyze.variables === v.id}
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
                  title={videos.data?.length ? 'Nothing here yet' : 'No videos yet'}
                  body="Upload a video or paste a link above, or add a creator — their latest videos and past streams appear here automatically."
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
