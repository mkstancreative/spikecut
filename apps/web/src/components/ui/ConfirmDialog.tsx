import { AlertTriangle, HelpCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { buttonClasses } from './Button'

export type ConfirmOptions = {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` styles the confirm button red and focuses Cancel, so Enter never destroys anything by accident. */
  tone?: 'danger' | 'default'
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

/**
 * Promise-based replacement for window.confirm():
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Delete this clip?', tone: 'danger' })) …
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // If one is already open, treat it as cancelled rather than stacking dialogs.
        setPending((prev) => {
          prev?.resolve(false)
          return { ...opts, resolve }
        })
      }),
    [],
  )

  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <Dialog options={pending} onClose={close} />}
    </ConfirmContext.Provider>
  )
}

function Dialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const danger = options.tone === 'danger'

  useEffect(() => {
    ref.current?.showModal()
    ;(danger ? cancelRef : confirmRef).current?.focus()
  }, [danger])

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby={options.body ? 'confirm-body' : undefined}
      // Esc fires "cancel" — resolve as a no.
      onCancel={(e) => {
        e.preventDefault()
        onClose(false)
      }}
      // Clicks on the backdrop land on the <dialog> element itself.
      onClick={(e) => e.target === ref.current && onClose(false)}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-(--radius-card) border border-white/10 bg-ink-900 p-0 text-ink-100 shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex gap-4">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              danger ? 'bg-cut/15 text-cut' : 'bg-spike/15 text-spike',
            )}
          >
            {danger ? <AlertTriangle className="size-5" /> : <HelpCircle className="size-5" />}
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="confirm-title" className="font-display text-lg leading-snug font-bold">
              {options.title}
            </h2>
            {options.body && (
              <div id="confirm-body" className="mt-2 text-sm text-ink-400">
                {options.body}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={() => onClose(false)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={buttonClasses({
              size: 'sm',
              className: danger ? 'bg-cut text-white shadow-none hover:bg-cut/85' : undefined,
            })}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
