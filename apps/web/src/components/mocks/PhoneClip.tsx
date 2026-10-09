import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

const WORDS = ['NO', 'WAY', 'HE', 'JUST', 'HIT', 'THAT', 'SHOT']

export function PhoneClip({ className }: { className?: string }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % WORDS.length), 420)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className={cn(
        'relative aspect-9/16 w-full overflow-hidden rounded-[1.75rem] border-4 border-ink-800 bg-ink-900 shadow-2xl shadow-black/60',
        className,
      )}
    >
      {/* Stand-in "footage": layered gradients instead of real stream frames */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_30%,#3a2a6b_0%,#1a1630_45%,#0b0c0e_100%)]" />
      <div className="absolute inset-x-0 top-[18%] mx-auto h-[38%] w-[62%] rounded-[45%] bg-[radial-gradient(circle_at_50%_40%,#f0b48a_0%,#b97752_55%,transparent_72%)] opacity-80 blur-[1px]" />

      {/* Face-tracking box */}
      <motion.div
        className="absolute top-[20%] left-[24%] h-[30%] w-[52%] rounded-lg border-2 border-signal/80"
        animate={{ x: [0, 6, -4, 0], y: [0, -3, 4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="absolute -top-5 left-0 rounded bg-signal px-1 font-mono text-[9px] font-bold text-ink-950">
          FACE 0.98
        </span>
      </motion.div>

      {/* Captions */}
      <div className="absolute inset-x-3 bottom-[22%] flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 text-center">
        {WORDS.map((w, i) => (
          <span
            key={i}
            className={cn(
              'font-display text-lg leading-tight font-extrabold tracking-tight transition-all duration-150 [text-shadow:0_2px_0_#000,0_0_8px_rgb(0_0_0/0.8)]',
              i === active ? 'scale-110 text-spike' : i < active ? 'text-white' : 'text-white/35',
            )}
          >
            {w}
          </span>
        ))}
      </div>

      {/* UI chrome */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[10px] text-white/80">
        <span className="rounded-full bg-black/50 px-2 py-0.5 font-mono">0:14 / 0:38</span>
        <span className="rounded-full bg-spike px-2 py-0.5 font-mono font-bold text-ink-950">9:16</span>
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <div className="h-1 overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full bg-spike"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      </div>
    </div>
  )
}
