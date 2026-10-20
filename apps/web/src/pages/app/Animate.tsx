import { Clapperboard, Film, Link2, LoaderCircle, RotateCcw, Sparkles, Trash2, UploadCloud, Wand2, X } from 'lucide-react'
import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ClipPlayer, JobProgress } from '@/components/app/ClipCard'
import { EmptyState } from '@/components/app/EmptyState'
import { StylePicker } from '@/components/app/StylePicker'
import { ScheduleDialog } from '@/components/app/ScheduleDialog'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { CollapsibleSection } from '@/components/ui/Collapsible'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Alert, inputClasses } from '@/components/ui/Field'
import { readDuration, useAnimateActions, useCartoonEngines, useUploads, useVideo, useVideoActions, type UploadedVideo } from '@/lib/animate'
import {
  cartoonStyle,
  creditsFor,
  MAX_CARTOON_SECONDS,
  MAX_DETAILS_CHARS,
  type CartoonStyleId,
} from '@/lib/animatePresets'
import { useActiveJobs, useClipActions, useClips, type ActiveJob, type Clip } from '@/lib/clips'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/creators'
import { usePersistentState } from '@/lib/usePersistentState'
import { useEntitlements, useWorkspace } from '@/lib/workspace'

const credits = (n: number) => `${n} credit${n === 1 ? '' : 's'}`
function UploadRow({
  video,
  job,
  clip,
  onRetry,
  retrying,
  onDelete,
  deleting,
}: {
  video: UploadedVideo
  job?: ActiveJob
  clip?: Clip
  onRetry: () => void
  retrying: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const confirm = useConfirm()
  const busy = video.analysis_status === 'queued' || video.analysis_status === 'running'
  const failed = video.analysis_status === 'failed'
  return (
    <li className="card flex items-start gap-3 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/6 text-ink-300">
        <Clapperboard className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium" title={video.title ?? undefined}>{video.title}</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {video.duration_seconds ? formatDuration(video.duration_seconds) : 'Uploaded'}
          {clip?.preset && ` · ${cartoonStyle(clip.preset)?.label ?? clip.preset}`} · {new Date(video.created_at).toLocaleDateString()}
        </p>
        {busy ? (
          <div className="mt-3">
            <JobProgress job={job} fallback={video.analysis_message} />
          </div>
        ) : (
          video.analysis_message && (
            <p className={cn('mt-1.5 text-xs', failed ? 'text-cut' : 'text-spike')}>
              {video.analysis_message}
              {failed && ' · any credits were refunded'}
            </p>
          )
        )}
      </div>
      {!busy && (
        <div className="flex shrink-0 items-center gap-1">
          {failed && (
            <ActionButton size="sm" variant="secondary" onClick={onRetry} loading={retrying} title="Try again">
              <RotateCcw className="size-3.5" />
              <span className="sr-only">Retry</span>
            </ActionButton>
          )}
          <button
            type="button"
            disabled={deleting}
            title="Delete upload"
            onClick={async () => {
              const ok = await confirm({
                title: 'Delete this upload?',
                body: 'The original file, its cartoon and any scheduled posts for it are removed. Credits already used aren’t refunded.',
                confirmLabel: 'Delete upload',
                tone: 'danger',
              })
              if (ok) onDelete()
            }}
            className="rounded-lg p-2 text-ink-400 hover:bg-cut/10 hover:text-cut disabled:opacity-50"
          >
            {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      )}
    </li>
  )
}

export default function Animate() {
  const workspace = useWorkspace()
  const wsId = workspace.data?.id
  const ent = useEntitlements(wsId)
  const engines = useCartoonEngines()
  const uploads = useUploads(wsId)
  const clips = useClips(wsId, 'cartoon')
  const jobs = useActiveJobs(wsId)
  const { upload, fromLink, retry, remove, uploadPct } = useAnimateActions(wsId)
  const { deleteClip } = useClipActions()
  const [savedStyle, setStyle] = usePersistentState<CartoonStyleId>('spikecut:animate:style', 'pixar3d')
  const [details, setDetails] = useState('')
  const [clipsOpen, setClipsOpen] = usePersistentState('spikecut:animate:clips', true)
  const [publishing, setPublishing] = useState<Clip | null>(null)
  const [dragging, setDragging] = useState(false)
  const [picked, setPicked] = useState<{ file: File; seconds: number | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [source, setSource] = usePersistentState<'file' | 'link'>('spikecut:animate:source', 'file')
  const [link, setLink] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  // "Cartoonify" on the Creators or Clips page arrives here as ?video=<id>.
  const [params, setParams] = useSearchParams()
  const videoId = params.get('video')
  const chosen = useVideo(videoId)
  const { cartoonify } = useVideoActions(wsId)

  const falReady = !!engines.data?.fal
  // Fall back to the free filter when the AI styles aren't available on this server.
  const style: CartoonStyleId = engines.data && !falReady && cartoonStyle(savedStyle)?.engine === 'fal' ? 'light' : savedStyle
  const isAi = cartoonStyle(style)?.engine === 'fal'
  const balance = ent.data?.credits ?? 0
  const cost = picked?.seconds != null ? creditsFor(style, picked.seconds) : null
  const clipByUpload = new Map(clips.data?.map((c) => [c.stream_id, c]))
  const titleByUpload = new Map(uploads.data?.map((u) => [u.id, u.title]))
  const uploading = upload.isPending
  const chosenSecs = chosen.data?.duration_seconds ?? null
  const chosenTooLong = chosenSecs != null && chosenSecs > MAX_CARTOON_SECONDS
  const chosenCost = chosenSecs != null ? creditsFor(style, chosenSecs) : null
  const chosenShort = (chosenCost ?? 1) > balance
  const error = (upload.error ?? fromLink.error ?? cartoonify.error ?? retry.error ?? remove.error ?? deleteClip.error) as Error | null

  const clearChosen = () => setParams((p) => (p.delete('video'), p), { replace: true })
  const navigate = useNavigate()
  const location = useLocation()
  // Back to the Creators or Clips page the video was picked on; straight to Creators if the link was opened directly.
  const pickAnother = () => (location.key === 'default' ? navigate('/app/creators') : navigate(-1))
  function startChosen() {
    if (!videoId) return
    cartoonify.mutate({ streamId: videoId, style, details }, { onSuccess: clearChosen })
  }

  async function pick(file: File | undefined) {
    if (!file || uploading) return
    setNotice(null)
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) {
      setNotice(`“${file.name}” isn’t a video SpikeCut can read — use MP4, MOV, WebM or MKV.`)
      return
    }
    const seconds = await readDuration(file)
    if (seconds != null && seconds > MAX_CARTOON_SECONDS) {
      setNotice(`That video is ${formatDuration(Math.round(seconds))} — cartoons can be up to ${MAX_CARTOON_SECONDS / 60} minutes. Trim it and try again.`)
      return
    }
    setPicked({ file, seconds })
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files[0])
  }
  function submitLink(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    fromLink.mutate({ url: link.trim(), style, details }, { onSuccess: () => setLink('') })
  }
  function start() {
    if (!picked) return
    upload.mutate({ file: picked.file, style, details }, { onSuccess: () => setPicked(null) })
  }

  return (
    <>
      <PageHeader title="Animate" description={`Turn any video into a cartoon and post it · ${ent.data?.credits ?? '—'} credits left`} />
      <div className="space-y-10 p-4 sm:p-8">
        {publishing && wsId && (
          <ScheduleDialog
            clipId={publishing.id}
            workspaceId={wsId}
            defaultTitle={titleByUpload.get(publishing.stream_id) ?? ''}
            durationSeconds={publishing.duration_seconds ?? undefined}
            onClose={() => setPublishing(null)}
          />
        )}
        {(notice ?? error) && <Alert>{notice ?? error?.message}</Alert>}

        <section className="card space-y-5 p-5">
          <div>
            <h2 className="font-display text-xl font-bold">New cartoon</h2>
            <p className="mt-1 text-sm text-ink-400">
              Your movement and voice stay the same — every frame is redrawn in the style you pick. Videos up to {MAX_CARTOON_SECONDS / 60} minutes.
            </p>
          </div>
          <StylePicker value={style} onChange={setStyle} falReady={falReady} />
          {isAi && (
            <div>
              <label htmlFor="cartoon-details" className="mb-1.5 block text-sm font-medium text-ink-300">
                Extra details <span className="text-ink-500">(optional)</span>
              </label>
              <input
                id="cartoon-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={MAX_DETAILS_CHARS}
                placeholder="e.g. make me a superhero in a neon city"
                className={inputClasses}
              />
            </div>
          )}

          {videoId ? (
            <div className="flex flex-col gap-4 rounded-(--radius-card) border border-spike/30 bg-ink-850 p-4 sm:flex-row sm:items-center">
              <div className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-900 sm:w-40">
                {chosen.data?.thumbnail_url ? (
                  <img src={chosen.data.thumbnail_url} alt="" className="size-full object-cover" />
                ) : (
                  <Film className="size-6 text-ink-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {chosen.isPending ? (
                  <p className="text-sm text-ink-400">Loading the video…</p>
                ) : !chosen.data ? (
                  <p className="text-sm text-cut">That video isn’t in your library any more.</p>
                ) : (
                  <>
                    <p className="line-clamp-2 font-medium">{chosen.data.title ?? 'Untitled video'}</p>
                    <p className="mt-0.5 text-sm text-ink-400">
                      {chosen.data.creators?.display_name ?? (chosen.data.source_path ? 'Your upload' : 'Pasted link')}
                      {chosen.data.duration_seconds ? ` · ${formatDuration(chosen.data.duration_seconds)}` : ''} · {cartoonStyle(style)?.label}
                    </p>
                    <p className={cn('mt-1 text-sm', chosenTooLong || chosenShort ? 'text-cut' : 'text-spike')}>
                      {chosenTooLong
                        ? `Longer than ${MAX_CARTOON_SECONDS / 60} minutes — too long to cartoonify`
                        : chosenCost != null
                          ? `Uses ${credits(chosenCost)}`
                          : isAi
                            ? 'Uses 1 credit per started minute'
                            : 'Uses 1 credit'}
                      {!chosenTooLong && chosenShort && ` — you have ${balance}. Top up first.`}
                    </p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <ActionButton variant="ghost" onClick={pickAnother} disabled={cartoonify.isPending}>
                  Pick another
                </ActionButton>
                <ActionButton onClick={startChosen} loading={cartoonify.isPending} disabled={!chosen.data || chosenTooLong || chosenShort}>
                  <Wand2 className="size-4" /> Cartoonify
                </ActionButton>
              </div>
            </div>
          ) : (
            <>
            <div role="tablist" aria-label="Video source" className="inline-flex rounded-xl border border-white/10 p-1">
              {(
                [
                  ['file', 'Upload a file', UploadCloud],
                  ['link', 'Paste a link', Link2],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={source === id}
                  disabled={uploading}
                  onClick={() => setSource(id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm',
                    source === id ? 'bg-spike/15 text-spike' : 'text-ink-400 hover:text-ink-100',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {source === 'link' ? (
              <form onSubmit={submitLink} className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    required
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://www.tiktok.com/@creator/video/…"
                    aria-label="Video link"
                    className={cn(inputClasses, 'flex-1')}
                  />
                  <ActionButton type="submit" loading={fromLink.isPending} disabled={balance < 1 || !link.trim()}>
                    <Wand2 className="size-4" /> Cartoonify
                  </ActionButton>
                </div>
                <p className="text-xs text-ink-500">
                  TikTok, Instagram, Facebook, X, YouTube and most other sites. Public posts only, up to {MAX_CARTOON_SECONDS / 60} minutes ·{' '}
                  {isAi ? '1 credit per started minute, worked out once it’s downloaded' : '1 credit'}.
                </p>
              </form>
            ) : picked ? (
              <div className="flex flex-col gap-4 rounded-(--radius-card) border border-white/10 bg-ink-850 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{picked.file.name}</p>
                  <p className="mt-0.5 text-sm text-ink-400">
                    {picked.seconds != null ? formatDuration(Math.round(picked.seconds)) : 'Length checked after upload'} ·{' '}
                    {(picked.file.size / 1e6).toFixed(0)} MB · {cartoonStyle(style)?.label}
                  </p>
                  <p className={cn('mt-1 text-sm', cost != null && cost > balance ? 'text-cut' : 'text-spike')}>
                    {cost != null ? `Uses ${credits(cost)}` : isAi ? 'Uses 1 credit per started minute' : 'Uses 1 credit'}
                    {cost != null && cost > balance && ` — you have ${balance}. Top up first.`}
                  </p>
                  {uploading && (
                    <div className="mt-3 max-w-sm">
                      <div className="flex justify-between text-xs text-ink-300">
                        <span>{uploadPct == null ? 'Queuing…' : 'Uploading'}</span>
                        {uploadPct != null && <span className="font-mono">{Math.round(uploadPct)}%</span>}
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-spike transition-[width] duration-500" style={{ width: `${uploadPct ?? 100}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-ink-500">Keep this tab open — if the connection drops, choosing the same file again resumes it.</p>
                    </div>
                  )}
                </div>
                {!uploading && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setPicked(null)} title="Choose another video" className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-ink-100">
                      <X className="size-4" />
                    </button>
                    <ActionButton onClick={start} disabled={cost != null ? cost > balance : balance < 1}>
                      <Wand2 className="size-4" /> Cartoonify
                    </ActionButton>
                  </div>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  'flex flex-col items-center rounded-(--radius-card) border border-dashed px-6 py-10 text-center transition-colors',
                  dragging ? 'border-spike bg-spike/5' : 'border-white/15',
                )}
              >
                <UploadCloud className="size-8 text-spike" />
                <p className="mt-3 font-medium">Drop a video here</p>
                <p className="mt-1 text-sm text-ink-400">MP4, MOV, WebM or MKV · up to {MAX_CARTOON_SECONDS / 60} min</p>
                <ActionButton className="mt-4" size="sm" onClick={() => fileInput.current?.click()} disabled={balance < 1}>
                  Choose a video
                </ActionButton>
              </div>
            )}
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv,.m4v"
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <p className="text-center text-xs text-ink-500">
            <Sparkles className="mr-1 inline size-3 text-signal" />
            AI styles are made by fal.ai; the Light filter runs on SpikeCut’s own server. Only upload videos you own or have permission to use.
          </p>
        </section>

        {!!clips.data?.length && (
          <CollapsibleSection title="Your cartoons" count={clips.data.length} open={clipsOpen} onToggle={() => setClipsOpen(!clipsOpen)}>
            <ul className="mt-4 grid grid-cols-2 items-start gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {clips.data.map((c) => (
                <li key={c.id} className={cn(c.width && c.height && c.width > c.height && 'col-span-2')}>
                  <ClipPlayer
                    clip={c}
                    title={titleByUpload.get(c.stream_id)}
                    job={jobs.get(c.stream_id)}
                    badge={
                      <span className="shrink-0 rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-ink-300">
                        {cartoonStyle(c.preset)?.label ?? 'Cartoon'}
                      </span>
                    }
                    onPublish={() => setPublishing(c)}
                    onDelete={() => deleteClip.mutate(c.id)}
                    deleting={deleteClip.isPending && deleteClip.variables === c.id}
                  />
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        <section>
          <h2 className="font-display text-xl font-bold">Uploads</h2>
          {uploads.data?.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {uploads.data.map((v) => (
                <UploadRow
                  key={v.id}
                  video={v}
                  job={jobs.get(v.id)}
                  clip={clipByUpload.get(v.id)}
                  onRetry={() => retry.mutate(v.id)}
                  retrying={retry.isPending && retry.variables === v.id}
                  onDelete={() => remove.mutate(v.id)}
                  deleting={remove.isPending && remove.variables === v.id}
                />
              ))}
            </ul>
          ) : (
            !uploads.isPending && (
              <div className="mt-4">
                <EmptyState icon={Film} title="Nothing uploaded yet" body="Pick a style, drop in a video, and your cartoon appears here when it’s ready." />
              </div>
            )
          )}
        </section>
      </div>
    </>
  )
}
