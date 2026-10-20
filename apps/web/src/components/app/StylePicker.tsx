import { cn } from '@/lib/cn'
import { cartoonStyle, cartoonStyles, type CartoonStyleId } from '@/lib/animatePresets'

const costLabel = (id: CartoonStyleId) => (cartoonStyle(id)?.engine === 'fal' ? '1 credit / min' : '1 credit')

export function StylePicker({ value, onChange, falReady }: { value: CartoonStyleId; onChange: (id: CartoonStyleId) => void; falReady: boolean }) {
  return (
    <div role="radiogroup" aria-label="Cartoon style" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {cartoonStyles.map((s) => {
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
              'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              value === s.id ? 'border-spike/60 bg-spike/10' : 'border-white/10 hover:bg-white/5',
            )}
          >
            <span className="flex items-center justify-between gap-2 font-medium">
              {s.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase',
                  s.engine === 'fal' ? 'bg-signal/15 text-signal' : 'bg-white/8 text-ink-300',
                )}
              >
                {s.engine === 'fal' ? 'AI' : 'Free'}
              </span>
            </span>
            <span className="mt-1 block text-xs text-ink-400">{unavailable ? 'Not set up on the server yet' : s.blurb}</span>
            <span className="mt-1.5 block font-mono text-[10px] text-ink-500">{costLabel(s.id)}</span>
          </button>
        )
      })}
    </div>
  )
}
