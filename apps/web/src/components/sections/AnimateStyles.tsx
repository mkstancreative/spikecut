import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { cartoonStyles, isFreeStyle } from '@/lib/animatePresets'
import { cn } from '@/lib/cn'

// Swatch per style for the illustration; styles without one fall back to a neutral gradient.
const hues: Record<string, string> = {
  pixar3d: 'from-sky-400 via-indigo-500 to-fuchsia-500',
  anime: 'from-rose-400 via-pink-500 to-violet-600',
  claymation: 'from-amber-300 via-orange-500 to-red-600',
  comic: 'from-yellow-300 via-red-500 to-blue-600',
  light: 'from-slate-200 via-sky-300 to-indigo-400',
  watercolor: 'from-teal-200 via-sky-300 to-violet-300',
  sketch: 'from-zinc-100 via-zinc-400 to-zinc-700',
  teal: 'from-teal-500 via-cyan-700 to-orange-400',
  golden: 'from-yellow-200 via-amber-400 to-orange-600',
  vintage: 'from-amber-100 via-yellow-700 to-stone-800',
  noir: 'from-white via-zinc-500 to-black',
}

export function AnimateStyles() {
  return (
    <section id="animate" className="border-y border-white/6 bg-ink-900/40">
      <div className="container-page py-24 sm:py-32">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="New · Animate"
            title="Turn any video into a cartoon."
            intro="Drop in a clip or paste a link, pick a style, and describe the scene — “make me a superhero in a neon city”. Post the result straight to your socials."
          />
          <Button to="/signup" variant="secondary" className="self-start lg:self-auto">
            Try Animate <ArrowRight className="size-4" />
          </Button>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {cartoonStyles.map((style) => {
            const free = isFreeStyle(style.id)
            return (
              <li key={style.id} className="card overflow-hidden">
                <div className={cn('relative aspect-[4/3] bg-linear-to-br', hues[style.id] ?? 'from-ink-700 to-ink-900')}>
                  <div className="absolute inset-0 grid-bg opacity-40" />
                  <span
                    className={cn(
                      'absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase',
                      free ? 'bg-ink-950/70 text-spike' : 'bg-spike text-ink-950',
                    )}
                  >
                    {free ? 'Free' : <><Sparkles className="size-3" /> AI</>}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-semibold">{style.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-400">{style.blurb}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-6 text-sm text-ink-500">AI styles use clip credits. Free filters run on SpikeCut’s own servers and cost nothing.</p>
      </div>
    </section>
  )
}
