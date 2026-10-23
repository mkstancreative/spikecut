import { motion } from 'motion/react'
import { cn } from '@/lib/cn'

// Deterministic pseudo-random so the chart is identical on every render.
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const BAR_COUNT = 40
const SPIKES: Record<number, { label: string; score: number }> = {
  9: { label: 'Clutch 1v3', score: 94 },
  23: { label: 'Crowd erupts', score: 88 },
  33: { label: 'Rage quit', score: 81 },
}

const bars = (() => {
  const rand = seeded(7)
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const spike = SPIKES[i]
    const near = Object.keys(SPIKES).some((k) => Math.abs(Number(k) - i) === 1)
    const base = 0.12 + rand() * 0.22
    const h = spike ? 0.92 + rand() * 0.08 : near ? base + 0.28 : base
    return { h, spike }
  })
})()

export function SpikeTimeline({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('card relative overflow-hidden p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="size-2 animate-pulse-dot rounded-full bg-cut" />
          <span className="font-mono tracking-wider text-ink-300 uppercase">Live · moment score</span>
        </div>
        <span className="font-mono text-[11px] text-ink-500">02:14:37</span>
      </div>

      <div className={cn('relative mt-4 flex items-end gap-1', compact ? 'h-24' : 'h-32 sm:h-40')}>
        {bars.map((bar, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.012, duration: 0.5, ease: 'easeOut' }}
            style={{ height: `${bar.h * 100}%` }}
            className={cn(
              'relative flex-1 origin-bottom rounded-sm',
              bar.spike ? 'bg-spike shadow-[0_0_16px_rgb(200_255_46/0.6)]' : 'bg-white/12',
            )}
          >
            {bar.spike && !compact && (
              <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-spike ring-1 ring-spike/30 sm:block">
                {bar.spike.score}
              </span>
            )}
          </motion.div>
        ))}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 w-px bg-signal shadow-[0_0_12px_rgb(57_208_255/0.9)]"
          initial={{ left: '0%' }}
          animate={{ left: '100%' }}
          transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {!compact && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {Object.values(SPIKES).map((s) => (
            <div key={s.label} className="rounded-lg border border-white/8 bg-ink-850 px-2.5 py-2">
              <p className="truncate text-xs font-medium text-ink-100">{s.label}</p>
              <p className="font-mono text-[11px] text-spike">score {s.score}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
