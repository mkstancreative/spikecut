import { AlertTriangle, ExternalLink, Plus, RefreshCw, Sparkles, Trash2, Users, Wand2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { EmptyState } from '@/components/app/EmptyState'
import { StreamCard } from '@/components/app/StreamCard'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Alert, inputClasses } from '@/components/ui/Field'
import { MAX_CARTOON_SECONDS } from '@/lib/animatePresets'
import { useClipActions } from '@/lib/clips'
import { cn } from '@/lib/cn'
import { getPlatformMeta, timeAgo, useCreatorActions, useCreators, useStreams, type Creator, type Stream } from '@/lib/creators'
import { useEntitlements, useWorkspace } from '@/lib/workspace'

function CreatorCard({ creator, onRemove, onRefresh, busy }: { creator: Creator; onRemove: () => void; onRefresh: () => void; busy: boolean }) {
  const meta = getPlatformMeta(creator.platform)
  const confirm = useConfirm()
  return (
    <li className="card flex items-center gap-4 p-4">
      <div className="relative shrink-0">
        {creator.avatar_url ? (
          <img src={creator.avatar_url} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-full bg-ink-800 font-bold">{creator.display_name[0]}</span>
        )}
        {creator.is_live && (
          <span className="absolute -right-1 -bottom-1 rounded bg-cut px-1 font-mono text-[9px] font-bold text-white">LIVE</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{creator.display_name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
          <span className={cn('size-1.5 rounded-full', meta.dot)} />
          {meta.label}
          {creator.handle && <span className="truncate">· {creator.handle}</span>}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          {creator.last_error ? (
            <span className="inline-flex items-center gap-1 text-cut">
              <AlertTriangle className="size-3" /> {creator.last_error}
            </span>
          ) : (
            <>Checked {timeAgo(creator.last_checked_at)}</>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <a href={creator.channel_url} target="_blank" rel="noreferrer" title="Open channel" className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-ink-100">
          <ExternalLink className="size-4" />
        </a>
        <button type="button" onClick={onRefresh} disabled={busy} title="Check now" className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-ink-100 disabled:opacity-50">
          <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: `Stop watching ${creator.display_name}?`,
              body: 'SpikeCut stops checking this channel. Their videos, detected moments and clips are removed from your workspace too.',
              confirmLabel: 'Remove creator',
              tone: 'danger',
            })
            if (ok) onRemove()
          }}
          title="Remove"
          className="rounded-lg p-2 text-ink-400 hover:bg-cut/10 hover:text-cut"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  )
}

/** Long videos can be mined for moments; anything up to the cartoon limit can be animated. */
function VideoActions({ stream, onFind, finding, onCartoonify }: { stream: Stream; onFind: () => void; finding: boolean; onCartoonify: () => void }) {
  const secs = stream.duration_seconds
  const tooShort = secs != null && secs < 60
  const tooLong = secs != null && secs > MAX_CARTOON_SECONDS
  return (
    <div className="grid grid-cols-2 gap-2">
      <ActionButton
        size="sm"
        variant="secondary"
        onClick={onFind}
        loading={finding}
        disabled={tooShort}
        title={tooShort ? 'Under a minute — too short to find moments in' : 'Find the best moments and make clips'}
      >
        <Sparkles className="size-3.5" /> Find moments
      </ActionButton>
      <ActionButton
        size="sm"
        variant="secondary"
        onClick={onCartoonify}
        disabled={tooLong}
        title={tooLong ? `Longer than ${MAX_CARTOON_SECONDS / 60} minutes — too long to cartoonify` : 'Turn this video into a cartoon'}
      >
        <Wand2 className="size-3.5" /> Cartoonify
      </ActionButton>
    </div>
  )
}

export default function Creators() {
  const workspace = useWorkspace()
  const wsId = workspace.data?.id
  const ent = useEntitlements(wsId)
  const creators = useCreators(wsId)
  const recent = useStreams(wsId, { limit: 12 })
  const { add, remove, refresh } = useCreatorActions(wsId)
  const { analyze } = useClipActions()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')

  const limit = ent.data?.limits.creators ?? 0
  const count = creators.data?.length ?? 0
  const full = count >= limit
  const byId = new Map(creators.data?.map((c) => [c.id, c]))

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    add.mutate(url.trim(), { onSuccess: () => setUrl('') })
  }

  return (
    <>
      <PageHeader title="Creators" description={`The channels SpikeCut watches for you · ${count} / ${limit}`} />
      <div className="space-y-8 p-4 sm:p-8">
        <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube, Twitch, TikTok or Instagram profile link — e.g. tiktok.com/@creator"
            className={cn(inputClasses, 'flex-1')}
            disabled={full}
            aria-label="Profile link"
          />
          <ActionButton type="submit" loading={add.isPending} disabled={full || !url.trim()}>
            <Plus className="size-4" /> Add creator
          </ActionButton>
        </form>
        {add.error && <Alert>{(add.error as Error).message}</Alert>}
        {full && <Alert tone="info">You’re watching the maximum for your plan. Remove a creator or upgrade to add more.</Alert>}

        {creators.data?.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {creators.data.map((c) => (
              <CreatorCard
                key={c.id}
                creator={c}
                busy={refresh.isPending && refresh.variables === c.id}
                onRefresh={() => refresh.mutate(c.id)}
                onRemove={() => remove.mutate(c.id)}
              />
            ))}
          </ul>
        ) : (
          !creators.isPending && (
            <EmptyState
              icon={Users}
              title="No creators yet"
              body="Paste a channel link above. SpikeCut checks every minute for new live streams and uploads."
            />
          )
        )}

        {!!recent.data?.length && (
          <section>
            <h2 className="font-display text-xl font-bold">Latest from your creators</h2>
            <p className="mt-1 text-sm text-ink-400">
              Find the best moments in a long video, or turn any of them into a cartoon.
            </p>
            {analyze.error && <Alert>{(analyze.error as Error).message}</Alert>}
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {recent.data.map((s) => (
                <li key={s.id}>
                  <StreamCard stream={s} creator={byId.get(s.creator_id)}>
                    <VideoActions
                      stream={s}
                      finding={analyze.isPending && analyze.variables === s.id}
                      onFind={() => analyze.mutate(s.id, { onSuccess: () => navigate('/app/clips') })}
                      onCartoonify={() => navigate(`/app/animate?video=${s.id}`)}
                    />
                  </StreamCard>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}
