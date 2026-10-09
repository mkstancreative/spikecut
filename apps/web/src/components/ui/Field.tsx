import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const inputClasses =
  'h-11 w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 text-sm text-ink-100 placeholder:text-ink-500 transition-colors focus:border-spike/60 focus:outline-none focus:ring-2 focus:ring-spike/20 disabled:opacity-60'

type FieldProps = ComponentProps<'input'> & { label: string; hint?: ReactNode }

export function Field({ label, hint, id, className, ...rest }: FieldProps) {
  const inputId = id ?? rest.name
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-sm font-medium text-ink-300">
          {label}
        </label>
        {hint}
      </div>
      <input id={inputId} className={inputClasses} {...rest} />
    </div>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-3.5 py-3 text-sm',
        tone === 'error' && 'border-cut/30 bg-cut/10 text-cut',
        tone === 'success' && 'border-spike/30 bg-spike/10 text-spike',
        tone === 'info' && 'border-signal/30 bg-signal/10 text-signal',
      )}
    >
      {children}
    </div>
  )
}
