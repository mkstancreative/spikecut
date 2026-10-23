import { cn } from '@/lib/cn'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const platformStyles = {
  YT: 'bg-red-500/15 text-red-300',
  IG: 'bg-pink-500/15 text-pink-300',
  FB: 'bg-blue-500/15 text-blue-300',
  TT: 'bg-cyan-400/15 text-cyan-300',
} as const
type P = keyof typeof platformStyles

const schedule: { time: string; p: P; done?: boolean }[][] = [
  [{ time: '09:00', p: 'YT', done: true }, { time: '18:30', p: 'IG', done: true }],
  [{ time: '12:15', p: 'TT', done: true }],
  [{ time: '09:00', p: 'YT', done: true }, { time: '20:00', p: 'FB' }],
  [{ time: '17:45', p: 'TT' }],
  [{ time: '09:00', p: 'YT' }, { time: '19:00', p: 'IG' }],
  [{ time: '14:00', p: 'FB' }],
  [{ time: '11:00', p: 'YT' }, { time: '21:00', p: 'TT' }],
]

export function PublishCalendar({ className }: { className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] tracking-wider text-ink-400 uppercase">This week · 12 clips</p>
        <span className="font-mono text-[11px] text-spike">queued</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => (
          <div key={d} className="min-w-0">
            <p className="text-center text-[10px] text-ink-500">{d}</p>
            <div className="mt-1.5 flex min-h-24 flex-col gap-1 rounded-lg bg-ink-850 p-1">
              {schedule[i].map((slot, j) => (
                <div
                  key={j}
                  className={cn(
                    'rounded-md px-1 py-1 text-center font-mono text-[9px] leading-tight',
                    platformStyles[slot.p],
                    slot.done && 'opacity-50',
                  )}
                >
                  <span className="block font-bold">{slot.p}</span>
                  {slot.time}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
