import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Field'
import { useClips, useMoments, useSignedUrl, type Clip } from '@/lib/clips'
import { cn } from '@/lib/cn'
import { socialMeta, usePublications, useSocialAccounts, useSocialActions, type Publication } from '@/lib/social'
import { useWorkspace } from '@/lib/workspace'

const dayFmt = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })

function dayLabel(d: Date) {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return dayFmt.format(d)
}

function Thumb({ clip }: { clip?: Clip }) {
  const url = useSignedUrl(clip?.thumbnail_path ?? null)
  return (
    <div className="aspect-9/16 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-800">
      {url.data && <img src={url.data} alt="" className="size-full object-cover" />}
    </div>
  )
}

const statusStyle: Record<Publication['status'], string> = {
  scheduled: 'bg-signal/15 text-signal',
  publishing: 'bg-spike/15 text-spike',
  published: 'bg-spike/15 text-spike',
  failed: 'bg-cut/15 text-cut',
  cancelled: 'bg-white/6 text-ink-400',
}

function PostRow({
  pub,
  clip,
  title,
  accountName,
  onCancel,
  onRetry,
}: {
  pub: Publication
  clip?: Clip
  title?: string | null
  accountName?: string
  onCancel: () => void
  onRetry: () => void
}) {
  const meta = socialMeta[pub.platform]
  return (
    <li className="flex items-center gap-3 rounded-xl bg-ink-850 p-3">
      <Thumb clip={clip} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{pub.title || title || 'Clip'}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
          <span className={cn('size-1.5 rounded-full', meta.dot)} />
          {accountName ?? meta.label} · {timeFmt.format(new Date(pub.published_at ?? pub.scheduled_at))}
        </p>
        {pub.error && (
          <p className="mt-1 line-clamp-2 inline-flex items-start gap-1 text-xs text-cut">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            {pub.status === 'scheduled' ? `Retrying soon — ${pub.error}` : pub.error}
          </p>
        )}
      </div>
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs capitalize', statusStyle[pub.status])}>
        {pub.status === 'publishing' && <LoaderCircle className="size-3 animate-spin" />}
        {pub.status === 'published' && <CheckCircle2 className="size-3" />}
        {pub.status}
      </span>
      <div className="flex shrink-0 items-center">
        {pub.permalink && (
          <a href={pub.permalink} target="_blank" rel="noreferrer" title="View post" className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-ink-100">
            <ExternalLink className="size-4" />
          </a>
        )}
        {pub.status === 'scheduled' && (
          <button type="button" onClick={onCancel} title="Cancel" className="rounded-lg p-2 text-ink-400 hover:bg-cut/10 hover:text-cut">
            <X className="size-4" />
          </button>
        )}
        {(pub.status === 'failed' || pub.status === 'cancelled') && (
          <button type="button" onClick={onRetry} title="Post now" className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-spike">
            <RotateCcw className="size-4" />
          </button>
        )}
      </div>
    </li>
  )
}

export default function Schedule() {
  const workspace = useWorkspace()
  const wsId = workspace.data?.id
  const pubs = usePublications(wsId)
  const accounts = useSocialAccounts(wsId)
  const clips = useClips(wsId)
  const moments = useMoments(wsId)
  const { cancel, retry } = useSocialActions(wsId)

  const clipById = new Map(clips.data?.map((c) => [c.id, c]))
  const titleByMoment = new Map(moments.data?.map((m) => [m.id, m.title]))
  const accountName = new Map(accounts.data?.map((a) => [a.id, a.display_name]))

  const upcoming = (pubs.data ?? []).filter((p) => p.status === 'scheduled' || p.status === 'publishing')
  const history = (pubs.data ?? [])
    .filter((p) => !upcoming.includes(p))
    .sort((a, b) => new Date(b.published_at ?? b.scheduled_at).getTime() - new Date(a.published_at ?? a.scheduled_at).getTime())

  const byDay = new Map<string, Publication[]>()
  for (const p of upcoming) {
    const key = new Date(p.scheduled_at).toDateString()
    byDay.set(key, [...(byDay.get(key) ?? []), p])
  }

  const row = (p: Publication) => {
    const clip = clipById.get(p.clip_id)
    return (
      <PostRow
        key={p.id}
        pub={p}
        clip={clip}
        title={clip && titleByMoment.get(clip.moment_id)}
        accountName={accountName.get(p.social_account_id)}
        onCancel={() => cancel.mutate(p.id)}
        onRetry={() => retry.mutate(p.id)}
      />
    )
  }

  const err = (cancel.error ?? retry.error) as Error | null

  return (
    <>
      <PageHeader
        title="Schedule"
        description="What’s going out, where and when. Times are shown in your local time zone."
        actions={<Button to="/app/clips" variant="secondary" size="sm">Schedule a clip</Button>}
      />
      <div className="space-y-10 p-4 sm:p-8">
        {err && <Alert>{err.message}</Alert>}

        <section>
          <h2 className="font-display text-xl font-bold">Upcoming</h2>
          {upcoming.length ? (
            <div className="mt-4 space-y-6">
              {[...byDay.entries()].map(([key, items]) => (
                <div key={key}>
                  <p className="mb-2 font-mono text-xs tracking-wider text-ink-500 uppercase">{dayLabel(new Date(key))}</p>
                  <ul className="space-y-2">{items.map(row)}</ul>
                </div>
              ))}
            </div>
          ) : (
            !pubs.isPending && (
              <div className="mt-4">
                <EmptyState
                  icon={CalendarClock}
                  title="Nothing scheduled"
                  body="Open a ready clip on the Clips page and choose Publish to post it now or queue it for the best time."
                  action={<Button to="/app/clips">Go to clips</Button>}
                />
              </div>
            )
          )}
        </section>

        {!!history.length && (
          <section>
            <h2 className="font-display text-xl font-bold">History</h2>
            <p className="mt-1 text-sm text-ink-400">Published, failed and cancelled posts from the last 30 days.</p>
            <ul className="mt-4 space-y-2">{history.map(row)}</ul>
          </section>
        )}
      </div>
    </>
  )
}
