import { Link2, UploadCloud, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'

// Fictional sources — sample data for the marketing illustration only.
const sources = [
  { icon: UserRound, label: '@thekitchenlab', sub: 'YouTube · new upload', tag: 'Creator' },
  { icon: Link2, label: 'tiktok.com/@novaplays/video/…', sub: 'Pasted link', tag: 'Link' },
  { icon: Link2, label: 'x.com/kaizenfps/status/…', sub: 'Pasted link', tag: 'Link' },
  { icon: UploadCloud, label: 'podcast-ep-42.mp4', sub: 'Uploaded · 48 min', tag: 'Upload' },
]

export function SourceList({ className }: { className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <p className="font-mono text-[11px] tracking-wider text-ink-400 uppercase">Library · 4 videos</p>
      <ul className="mt-3 space-y-2">
        {sources.map(({ icon: Icon, label, sub, tag }) => (
          <li key={label} className="flex items-center gap-3 rounded-xl bg-ink-850 p-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-spike/10 text-spike">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="text-[11px] text-ink-500">{sub}</p>
            </div>
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">{tag}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
