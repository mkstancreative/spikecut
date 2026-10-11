import { Eye, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDuration, platformMeta, timeAgo, type Creator, type Stream } from '@/lib/creators'

const kindLabel: Record<Stream['kind'], string> = { live: 'Live', vod: 'Past stream', upload: 'Video' }

export function StreamCard({ stream, creator }: { stream: Stream; creator?: Creator }) {
  const live = stream.status === 'live'
  return (
    <a href={stream.url} target="_blank" rel="noreferrer" className="card group block overflow-hidden transition-colors hover:border-white/20">
      <div className="relative aspect-video bg-ink-850">
        {stream.thumbnail_url && (
          <img src={stream.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
          <PlayCircle className="size-10 text-white" />
        </span>
        <span
          className={cn(
            'absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
            live ? 'bg-cut text-white' : stream.status === 'upcoming' ? 'bg-signal text-ink-950' : 'bg-black/60 text-white',
          )}
        >
          {live && <span className="size-1.5 animate-pulse-dot rounded-full bg-white" />}
          {live ? 'LIVE' : stream.status === 'upcoming' ? 'UPCOMING' : kindLabel[stream.kind].toUpperCase()}
        </span>
        {live && stream.viewer_count != null && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
            <Eye className="size-3" /> {stream.viewer_count.toLocaleString()}
          </span>
        )}
        {!live && stream.duration_seconds ? (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {formatDuration(stream.duration_seconds)}
          </span>
        ) : null}
      </div>
      <div className="p-3.5">
        <p className="line-clamp-2 text-sm font-medium">{stream.title ?? 'Untitled'}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <span className={cn('size-1.5 rounded-full', platformMeta[stream.platform].dot)} />
          {creator?.display_name ?? platformMeta[stream.platform].label} · {timeAgo(live ? stream.started_at : stream.published_at)}
        </p>
      </div>
    </a>
  )
}
