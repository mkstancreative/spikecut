import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SpikeTimeline } from '@/components/mocks/SpikeTimeline'
import { Alert } from '@/components/ui/Field'
import { Logo } from '@/components/ui/Logo'
import { isSupabaseConfigured } from '@/lib/env'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link to="/" aria-label="SpikeCut home" className="self-start">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-400">{subtitle}</p>}
          {!isSupabaseConfigured && (
            <div className="mt-6">
              <Alert tone="info">
                Accounts aren’t connected yet. Add <code className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code> to{' '}
                <code className="font-mono">apps/web/.env.local</code> and restart the dev server.
              </Alert>
            </div>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-white/6 bg-ink-900 lg:flex lg:flex-col lg:justify-center lg:p-16">
        <div aria-hidden className="absolute inset-0 grid-bg [mask-image:radial-gradient(80%_70%_at_50%_40%,black,transparent)]" />
        <div aria-hidden className="absolute top-1/4 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-spike/10 blur-[110px]" />
        <div className="relative mx-auto w-full max-w-md">
          <SpikeTimeline />
          <p className="mt-10 font-display text-2xl leading-snug font-bold text-balance">
            The best moment of the stream happens at 2am. Your clip can be live before you wake up.
          </p>
          <p className="mt-3 text-sm text-ink-500">Monitoring, scoring, editing and posting — on autopilot.</p>
        </div>
      </aside>
    </div>
  )
}
