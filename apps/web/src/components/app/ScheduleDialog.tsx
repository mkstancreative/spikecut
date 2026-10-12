import { CalendarClock, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, inputClasses } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { socialMeta, suggestTime, toLocalInput, usePublications, useSocialAccounts, useSocialActions } from '@/lib/social'

type Props = { clipId: string; defaultTitle: string; workspaceId: string; onClose: () => void }

export function ScheduleDialog({ clipId, defaultTitle, workspaceId, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const accounts = useSocialAccounts(workspaceId)
  const pubs = usePublications(workspaceId)
  const { schedule } = useSocialActions(workspaceId)

  const active = accounts.data?.filter((a) => a.status === 'active') ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState(defaultTitle.slice(0, 95))
  const [caption, setCaption] = useState('')
  const [mode, setMode] = useState<'now' | 'later'>('later')
  const [when, setWhen] = useState(() => toLocalInput(suggestTime()))

  useEffect(() => dialog.current?.showModal(), [])
  // Pre-tick every connected account once they load.
  useEffect(() => {
    if (accounts.data) setSelected(new Set(accounts.data.filter((a) => a.status === 'active').map((a) => a.id)))
  }, [accounts.data])

  function suggest() {
    const taken = (pubs.data ?? []).filter((p) => p.status === 'scheduled').map((p) => new Date(p.scheduled_at))
    setWhen(toLocalInput(suggestTime(taken)))
    setMode('later')
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    schedule.mutate(
      {
        clipId,
        accountIds: [...selected],
        title,
        caption,
        scheduledAt: mode === 'now' ? new Date().toISOString() : new Date(when).toISOString(),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-(--radius-card) border border-white/10 bg-ink-900 p-0 text-ink-100 backdrop:bg-black/70"
    >
      <form onSubmit={onSubmit} className="space-y-5 p-6">
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold">Publish clip</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-400 hover:text-ink-100">
            <X className="size-5" />
          </button>
        </div>

        {schedule.error && <Alert>{(schedule.error as Error).message}</Alert>}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-300">Post to</legend>
          {active.length ? (
            <ul className="space-y-2">
              {active.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-ink-850 p-2.5 has-checked:ring-1 has-checked:ring-spike/50">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#c8ff2e]"
                      checked={selected.has(a.id)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(a.id)
                        else next.delete(a.id)
                        setSelected(next)
                      }}
                    />
                    <span className={cn('size-2 rounded-full', socialMeta[a.platform].dot)} />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.display_name}</span>
                    <span className="text-xs text-ink-500">{socialMeta[a.platform].label}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-ink-400">
              No accounts connected.{' '}
              <Link to="/app/accounts" className="text-spike hover:underline">
                Connect one →
              </Link>
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="pub-title" className="mb-1.5 block text-sm font-medium text-ink-300">
            Title <span className="text-ink-500">(YouTube & Facebook)</span>
          </label>
          <input id="pub-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={inputClasses} />
        </div>
        <div>
          <label htmlFor="pub-caption" className="mb-1.5 block text-sm font-medium text-ink-300">
            Caption & hashtags
          </label>
          <textarea
            id="pub-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={2200}
            placeholder="Credit the creator and add a few hashtags…"
            className={cn(inputClasses, 'h-auto py-2.5')}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-300">When</p>
          <div className="grid grid-cols-2 gap-2">
            {(['now', 'later'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm',
                  mode === m ? 'border-spike/60 bg-spike/10 text-spike' : 'border-white/10 text-ink-300 hover:bg-white/5',
                )}
              >
                {m === 'now' ? <Send className="size-4" /> : <CalendarClock className="size-4" />}
                {m === 'now' ? 'Post now' : 'Schedule'}
              </button>
            ))}
          </div>
          {mode === 'later' && (
            <div className="mt-3 flex gap-2">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cn(inputClasses, 'flex-1')} required />
              <button
                type="button"
                onClick={suggest}
                title="Suggest the next good posting slot"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-ink-300 hover:bg-white/5"
              >
                <Sparkles className="size-4 text-spike" /> Best time
              </button>
            </div>
          )}
        </div>

        <ActionButton type="submit" className="w-full" loading={schedule.isPending} disabled={!selected.size}>
          {mode === 'now' ? 'Publish now' : `Schedule to ${selected.size} account${selected.size === 1 ? '' : 's'}`}
        </ActionButton>
        <p className="text-center text-xs text-ink-500">Only post clips you have permission to share.</p>
      </form>
    </dialog>
  )
}
