import { Eye } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

// Placeholder cards. In Phase 3 this is fed by the Twitch Helix + YouTube Data APIs
// and only shows channels the platform confirms are live right now.
const streams = [
  { name: 'novaplays', title: 'Ranked grind to top 500 — !socials', category: 'Valorant', platform: 'Twitch', viewers: 18240, hue: 'from-fuchsia-600/70 via-violet-700/60 to-ink-900' },
  { name: 'thekitchenlab', title: 'Cooking jollof for 200 people LIVE', category: 'Food & Drink', platform: 'YouTube', viewers: 6410, hue: 'from-orange-500/70 via-red-700/50 to-ink-900' },
  { name: 'kaizenfps', title: 'Tournament qualifiers day 2', category: 'Counter-Strike', platform: 'TikTok', viewers: 3120, hue: 'from-emerald-500/60 via-teal-800/60 to-ink-900' },
]

const fmt = new Intl.NumberFormat('en', { notation: 'compact' })

export function LiveNow() {
  return (
    <section className="border-y border-white/6 bg-ink-900/40">
      <div className="container-page py-24 sm:py-32">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Live right now"
            title="Real streams in. Ready clips out."
            intro="Live status and viewer counts come straight from each platform’s API. Open a stream and SpikeCut starts scoring it in seconds."
          />
          <Button to="/signup" variant="secondary" className="self-start lg:self-auto">
            Connect your channels
          </Button>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {streams.map((s) => (
            <li key={s.name} className="card group overflow-hidden">
              <div className={cn('relative aspect-video bg-linear-to-br', s.hue)}>
                <div className="absolute inset-0 grid-bg opacity-50" />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-cut px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-white" /> LIVE
                </span>
                <span className="absolute top-3 right-3 rounded-md bg-black/50 px-2 py-0.5 text-[11px]">{s.platform}</span>
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px]">
                  <Eye className="size-3" /> {fmt.format(s.viewers)}
                </span>
              </div>
              <div className="p-4">
                <p className="font-semibold">{s.name}</p>
                <p className="mt-1 truncate text-sm text-ink-400">{s.title}</p>
                <p className="mt-3 text-xs text-ink-500">{s.category}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
