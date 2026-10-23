import { cn } from '@/lib/cn'

const platforms = [
  { name: 'YouTube', dot: 'bg-red-500', note: 'Watch + post' },
  { name: 'TikTok', dot: 'bg-cyan-400', note: 'Watch + post' },
  { name: 'Instagram', dot: 'bg-pink-500', note: 'Watch + post' },
  { name: 'Twitch', dot: 'bg-violet-400', note: 'Watch' },
  { name: 'Facebook', dot: 'bg-blue-500', note: 'Post' },
  { name: 'X', dot: 'bg-ink-100', note: 'Paste links' },
  { name: 'Kick', dot: 'bg-lime-400', note: 'Soon', soon: true },
]

export function Platforms() {
  return (
    <section className="border-y border-white/6 bg-ink-900/40">
      <div className="container-page flex flex-col gap-4 py-8 lg:flex-row lg:items-center lg:gap-10">
        <p className="shrink-0 font-mono text-xs tracking-[0.18em] text-ink-500 uppercase">Works with</p>
        <ul className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <li
              key={p.name}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-white/8 bg-ink-900 px-3.5 py-2 text-sm',
                p.soon && 'opacity-60',
              )}
            >
              <span className={cn('size-2 rounded-full', p.dot)} />
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-ink-500">{p.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
