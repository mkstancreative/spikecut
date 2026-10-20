import { useState } from 'react'
import { cn } from '@/lib/cn'
import { cartoonStyles, isFreeStyle, type CartoonStyleId } from '@/lib/animatePresets'

const groups = [
  { title: 'AI styles', note: 'Redrawn by generative AI · 1 credit per started minute', free: false },
  { title: 'Free effects', note: 'Run on SpikeCut’s own server · no credits', free: true },
]

/** A sample of the look, from public/styles/<id>.jpg (made by scripts/style-previews.ts). Hidden if missing. */
function Preview({ id }: { id: CartoonStyleId }) {
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return (
    <img
      src={`/styles/${id}.jpg`}
      alt=""
      loading="lazy"
      onError={() => setMissing(true)}
      className="mb-2 aspect-[3/4] w-full rounded-lg bg-ink-850 object-cover"
    />
  )
}

export function StylePicker({ value, onChange, falReady }: { value: CartoonStyleId; onChange: (id: CartoonStyleId) => void; falReady: boolean }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink-300">
            {g.title} <span className="text-xs font-normal text-ink-500">{g.note}</span>
          </p>
          <div role="radiogroup" aria-label={g.title} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {cartoonStyles
              .filter((s) => isFreeStyle(s.id) === g.free)
              .map((s) => {
                const unavailable = s.engine === 'fal' && !falReady
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={value === s.id}
                    disabled={unavailable}
                    onClick={() => onChange(s.id)}
                    className={cn(
                      'rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      value === s.id ? 'border-spike/60 bg-spike/10' : 'border-white/10 hover:bg-white/5',
                    )}
                  >
                    <Preview id={s.id} />
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {s.label}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase',
                          g.free ? 'bg-spike/15 text-spike' : 'bg-signal/15 text-signal',
                        )}
                      >
                        {g.free ? 'Free' : 'AI'}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-ink-400">{unavailable ? 'Not set up on the server yet' : s.blurb}</span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
