import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

// A frame "before" and three styled "after" swatches — illustration only.
const looks = [
  { label: '3D animated', hue: 'from-sky-400 via-indigo-500 to-fuchsia-500', ai: true },
  { label: 'Anime', hue: 'from-rose-400 via-pink-500 to-violet-600', ai: true },
  { label: 'Watercolor', hue: 'from-teal-200 via-sky-300 to-violet-300', ai: false },
]

export function StylePreview({ className }: { className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] tracking-wider text-ink-400 uppercase">New cartoon</p>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-spike">
          <Sparkles className="size-3" /> rendering
        </span>
      </div>
      <p className="mt-3 rounded-xl bg-ink-850 px-3 py-2 text-xs text-ink-300">“make me a superhero in a neon city”</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {looks.map((l, i) => (
          <li key={l.label} className={cn('overflow-hidden rounded-xl ring-1 ring-white/8', i === 0 && 'ring-2 ring-spike')}>
            <div className={cn('aspect-9/16 bg-linear-to-br', l.hue)} />
            <p className="truncate bg-ink-850 px-2 py-1 text-[10px] text-ink-300">
              {l.label} · {l.ai ? 'AI' : 'Free'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
