import { ArrowRight, Check, Film, Link2, Users, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/AppLayout'
import { cn } from '@/lib/cn'
import { planName } from '@/lib/pricing'
import { useCreators } from '@/lib/creators'
import { useSocialAccounts } from '@/lib/social'
import { useEntitlements, useProfile, useWorkspace } from '@/lib/workspace'

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Zap }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between text-sm text-ink-400">
        {label}
        <Icon className="size-4 text-ink-500" />
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  )
}

export default function Overview() {
  const profile = useProfile()
  const workspace = useWorkspace()
  const ent = useEntitlements(workspace.data?.id)
  const creators = useCreators(workspace.data?.id)
  const creatorCount = creators.data?.length ?? 0
  const socialCount = useSocialAccounts(workspace.data?.id).data?.length ?? 0
  const firstName = profile.data?.full_name?.split(' ')[0]
  const isPaid = ent.data && ent.data.plan_id !== 'free'

  const steps = [
    { done: true, label: 'Create your account', to: '/app/settings' },
    { done: creatorCount > 0, label: 'Add the first creator you want to clip', to: '/app/creators' },
    { done: socialCount > 0, label: 'Connect YouTube, Instagram or Facebook', to: '/app/accounts' },
    { done: !!isPaid, label: 'Pick a plan or grab a Day Pass', to: '/app/billing' },
  ]

  return (
    <>
      <PageHeader title={firstName ? `Hey ${firstName} 👋` : 'Overview'} description="Here’s what SpikeCut is doing for you." />
      <div className="space-y-8 p-4 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Plan" value={ent.data ? planName(ent.data.plan_id) : '—'} icon={Zap} />
          <Stat label="Clip credits" value={ent.data ? ent.data.credits.toLocaleString() : '—'} icon={Film} />
          <Stat label="Creators watched" value={ent.data ? `${creatorCount} / ${ent.data.limits.creators}` : '—'} icon={Users} />
          <Stat label="Social accounts" value={ent.data ? `${socialCount} / ${ent.data.limits.socialAccounts}` : '—'} icon={Link2} />
        </div>

        <section className="card p-6">
          <h2 className="font-display text-lg font-bold">Get set up</h2>
          <ol className="mt-4 divide-y divide-white/6">
            {steps.map((s) => (
              <li key={s.label}>
                <Link to={s.to} className="group flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border',
                      s.done ? 'border-spike bg-spike text-ink-950' : 'border-white/15 text-transparent',
                    )}
                  >
                    <Check className="size-3.5" />
                  </span>
                  <span className={cn('flex-1 text-sm', s.done ? 'text-ink-500 line-through' : 'text-ink-100')}>{s.label}</span>
                  {!s.done && <ArrowRight className="size-4 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-spike" />}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
