import { Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

// Fictional handles — sample data for the marketing illustration only.
const creators = [
  { handle: 'novaplays', platform: 'Twitch', live: true, viewers: '18.2K', hue: 'from-fuchsia-500 to-orange-400' },
  { handle: 'thekitchenlab', platform: 'YouTube', live: true, viewers: '6.4K', hue: 'from-sky-400 to-emerald-400' },
  { handle: 'deadlinepod', platform: 'TikTok', live: false, viewers: 'New video', hue: 'from-amber-300 to-rose-500' },
  { handle: 'kaizenfps', platform: 'Instagram', live: false, viewers: 'Offline', hue: 'from-lime-300 to-teal-500' },
]

export function CreatorList({ className }: { className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] tracking-wider text-ink-400 uppercase">Watching · 4/10</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-spike/10 px-2 py-1 text-[11px] font-semibold text-spike">
          <Plus className="size-3" /> Add
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {creators.map((c) => (
          <li key={c.handle} className="flex items-center gap-3 rounded-xl bg-ink-850 p-2.5">
            <span className={cn('size-8 shrink-0 rounded-full bg-linear-to-br', c.hue)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">@{c.handle}</p>
              <p className="text-[11px] text-ink-500">{c.platform}</p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px]',
                c.live ? 'bg-cut/15 text-cut' : 'bg-white/5 text-ink-400',
              )}
            >
              {c.live && <span className="size-1.5 animate-pulse-dot rounded-full bg-cut" />}
              {c.live ? `LIVE ${c.viewers}` : c.viewers}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
