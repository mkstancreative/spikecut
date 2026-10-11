import { Radio } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/app/EmptyState'
import { StreamCard } from '@/components/app/StreamCard'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { useCreators, useStreams, type Stream } from '@/lib/creators'
import { useWorkspace } from '@/lib/workspace'

// Official embeds only — Twitch requires the embedding page's hostname as `parent`.
function embedUrl(stream: Stream, channelLogin?: string | null) {
  if (stream.platform === 'youtube') return `https://www.youtube.com/embed/${stream.external_id}?autoplay=1&mute=1`
  if (stream.platform === 'twitch' && channelLogin) {
    return `https://player.twitch.tv/?channel=${channelLogin}&parent=${window.location.hostname}&muted=true`
  }
  return null
}

export default function Live() {
  const workspace = useWorkspace()
  const creators = useCreators(workspace.data?.id)
  const live = useStreams(workspace.data?.id, { live: true })
  const [watching, setWatching] = useState<string | null>(null)
  const byId = new Map(creators.data?.map((c) => [c.id, c]))

  const current = live.data?.find((s) => s.id === watching) ?? live.data?.[0]
  const currentEmbed = current && embedUrl(current, byId.get(current.creator_id)?.handle)

  return (
    <>
      <PageHeader title="Live" description="Creators you watch who are streaming right now. Checked every minute." />
      <div className="space-y-6 p-4 sm:p-8">
        {live.data?.length ? (
          <>
            {current && currentEmbed && (
              <div className="card overflow-hidden">
                <div className="aspect-video bg-black">
                  <iframe
                    key={current.id}
                    src={currentEmbed}
                    title={current.title ?? 'Live stream'}
                    className="size-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="p-4">
                  <p className="font-semibold">{current.title}</p>
                  <p className="mt-1 text-sm text-ink-400">
                    {byId.get(current.creator_id)?.display_name}
                    {current.viewer_count != null && ` · ${current.viewer_count.toLocaleString()} watching`}
                  </p>
                </div>
              </div>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {live.data.map((s) => (
                <li
                  key={s.id}
                  onClickCapture={(e) => {
                    e.preventDefault()
                    setWatching(s.id)
                  }}
                  className={cn('cursor-pointer rounded-(--radius-card)', s.id === current?.id && 'ring-2 ring-spike/50')}
                >
                  <StreamCard stream={s} creator={byId.get(s.creator_id)} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          !live.isPending && (
            <EmptyState
              icon={Radio}
              title="Nobody’s live right now"
              body={
                creators.data?.length
                  ? 'When one of your creators goes live, the stream appears here within about a minute.'
                  : 'Add the creators you clip and their live streams will show up here.'
              }
              action={!creators.data?.length && <Button to="/app/creators">Add a creator</Button>}
            />
          )
        )}
      </div>
    </>
  )
}
