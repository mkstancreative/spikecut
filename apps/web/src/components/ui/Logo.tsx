import { brand } from '@/lib/brand'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8', className)}>
      <rect width="32" height="32" rx="8" className="fill-spike" />
      <path
        d="M5 19h5l2.5-4 3 9L20 6l2.5 13H27"
        fill="none"
        className="stroke-ink-950"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16.2 4.5 21 27.5" className="stroke-spike" strokeWidth="2.2" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-7" />
      <span className="font-display text-lg font-bold tracking-tight">{brand.name}</span>
    </span>
  )
}
