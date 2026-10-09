import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, body, badge, action }: { icon: LucideIcon; title: string; body: string; badge?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-(--radius-card) border border-dashed border-white/10 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-spike/10 text-spike">
        <Icon className="size-6" />
      </span>
      {badge && (
        <span className="mt-5 rounded-full bg-white/6 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-ink-400 uppercase">
          {badge}
        </span>
      )}
      <h2 className="mt-3 font-display text-xl font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-ink-400">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
