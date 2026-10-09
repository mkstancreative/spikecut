import { cn } from '@/lib/cn'
import { planName, type PlanId } from '@/lib/pricing'

export function PlanBadge({ plan, className }: { plan: PlanId; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase',
        plan === 'free' ? 'bg-white/8 text-ink-400' : 'bg-spike/15 text-spike',
        className,
      )}
    >
      {planName(plan)}
    </span>
  )
}
