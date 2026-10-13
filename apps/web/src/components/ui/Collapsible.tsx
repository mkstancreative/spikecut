import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Section heading that folds its content. `actions` sit on the right and don't toggle. */
export function CollapsibleSection({
  title,
  count,
  description,
  open,
  onToggle,
  actions,
  children,
}: {
  title: string
  count?: number
  description?: ReactNode
  open: boolean
  onToggle: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="group -ml-1 flex items-center gap-2 rounded-lg px-1 py-0.5 text-left"
        >
          <ChevronDown className={cn('size-5 text-ink-500 transition-transform group-hover:text-ink-100', !open && '-rotate-90')} />
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {count != null && <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-xs text-ink-400">{count}</span>}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {open && (
        <div id={id}>
          {description && <div className="mt-1 text-sm text-ink-400">{description}</div>}
          {children}
        </div>
      )}
    </section>
  )
}

/** Small inline fold toggle, e.g. "6 moments · 4 waiting". */
export function FoldToggle({ open, onToggle, children, controls }: { open: boolean; onToggle: () => void; children: ReactNode; controls?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="group inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs text-ink-400 hover:text-ink-100"
    >
      <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
      {children}
    </button>
  )
}
