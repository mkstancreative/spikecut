import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PlanBadge } from '@/components/app/PlanBadge'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { billingCurrencies } from '@/lib/env'
import { formatPrice, planName, plans, type Currency, type Plan } from '@/lib/pricing'
import { useEntitlements, usePayments, useProfile, useWorkspace } from '@/lib/workspace'

const dateFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
const dateTimeFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

type Notice = { tone: 'success' | 'error' | 'info'; text: string }

export default function Billing() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const profile = useProfile()
  const workspace = useWorkspace()
  const ent = useEntitlements(workspace.data?.id)
  const payments = usePayments(workspace.data?.id)
  const [notice, setNotice] = useState<Notice | null>(null)
  const verifiedRef = useRef<string | null>(null)

  const currency: Currency =
    profile.data && billingCurrencies.includes(profile.data.currency) ? profile.data.currency : billingCurrencies[0]
  const highlighted = params.get('plan')
  const canManage = workspace.data?.role === 'owner' || workspace.data?.role === 'admin'

  // Back from Paystack: /app/billing?reference=…&trxref=…
  useEffect(() => {
    const reference = params.get('reference') ?? params.get('trxref')
    if (!reference || verifiedRef.current === reference) return
    verifiedRef.current = reference
    setNotice({ tone: 'info', text: 'Confirming your payment…' })
    api<{ status: string }>(`/billing/verify?reference=${encodeURIComponent(reference)}`)
      .then(({ status }) => {
        setNotice(
          status === 'success'
            ? { tone: 'success', text: 'Payment confirmed — your credits are ready.' }
            : { tone: 'error', text: `Payment ${status}. You haven’t been charged.` },
        )
        queryClient.invalidateQueries()
      })
      .catch((e: Error) => setNotice({ tone: 'error', text: e.message }))
      .finally(() => setParams({}, { replace: true }))
  }, [params, setParams, queryClient])

  const checkout = useMutation({
    mutationFn: (plan: Plan) =>
      api<{ url: string }>('/billing/checkout', { body: { workspaceId: workspace.data!.id, planId: plan.id, currency } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e: Error) => setNotice({ tone: 'error', text: e.message }),
  })

  const cancel = useMutation({
    mutationFn: () => api('/billing/cancel', { body: { workspaceId: workspace.data!.id } }),
    onSuccess: () => {
      setNotice({ tone: 'success', text: 'Your plan won’t renew. You keep access until the end of this period.' })
      queryClient.invalidateQueries()
    },
    onError: (e: Error) => setNotice({ tone: 'error', text: e.message }),
  })

  const e = ent.data
  const subscribed = e && e.subscription_status === 'active'

  return (
    <>
      <PageHeader title="Billing" description="Your plan, credits and payments." />
      <div className="space-y-8 p-4 sm:p-8">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {!canManage && workspace.data && (
          <Alert tone="info">Only workspace owners and admins can change billing.</Alert>
        )}

        {/* Current plan */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ink-400">Current plan</p>
                <p className="mt-1 flex items-center gap-2 font-display text-3xl font-bold">
                  {e ? planName(e.plan_id) : '—'}
                  {e && <PlanBadge plan={e.plan_id} />}
                </p>
              </div>
              {subscribed && canManage && (
                <ActionButton
                  variant="danger"
                  size="sm"
                  loading={cancel.isPending}
                  onClick={() => {
                    if (confirm('Cancel your plan? You’ll keep access until the current period ends.')) cancel.mutate()
                  }}
                >
                  Cancel plan
                </ActionButton>
              )}
            </div>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              {e?.period_end && (
                <div>
                  <dt className="text-ink-500">{e.subscription_status === 'active' ? 'Renews on' : 'Access until'}</dt>
                  <dd className="mt-0.5">{dateFmt.format(new Date(e.period_end))}</dd>
                </div>
              )}
              {e?.day_pass_until && (
                <div>
                  <dt className="text-ink-500">Day Pass active until</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5">
                    <Clock className="size-3.5 text-spike" />
                    {dateTimeFmt.format(new Date(e.day_pass_until))}
                  </dd>
                </div>
              )}
              {e && (
                <div>
                  <dt className="text-ink-500">Includes</dt>
                  <dd className="mt-0.5">
                    {e.limits.creators} creators · {e.limits.socialAccounts} social accounts · {e.limits.seats} seat
                    {e.limits.seats > 1 && 's'}
                  </dd>
                </div>
              )}
              {e?.plan_id === 'free' && (
                <div className="sm:col-span-2">
                  <dd className="text-ink-400">
                    You can add creators and see detected moments for free. Rendering clips needs a plan or a Day Pass.
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="card flex flex-col justify-between p-6">
            <div className="flex items-center justify-between text-sm text-ink-400">
              Clip credits
              <Zap className="size-4 text-spike" />
            </div>
            <p className="mt-2 font-display text-5xl font-extrabold">{e ? e.credits.toLocaleString() : '—'}</p>
            <p className="mt-2 text-xs text-ink-500">
              One credit renders one clip. Day Pass credits are used first, then monthly credits. Unused monthly credits
              expire at renewal.
            </p>
          </div>
        </section>

        {/* Plans */}
        <section>
          <h2 className="font-display text-xl font-bold">{subscribed ? 'Change plan' : 'Choose a plan'}</h2>
          <p className="mt-1 text-sm text-ink-400">
            Prices in {currency}. Paid securely with Paystack — card, bank transfer or USSD.
          </p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {plans.map((plan) => {
              const current = e?.plan_id === plan.id && (plan.period === 'month' ? subscribed : true)
              return (
                <li
                  key={plan.id}
                  className={cn(
                    'card flex flex-col p-5',
                    plan.id === highlighted && 'border-spike/60 ring-2 ring-spike/20',
                    plan.period === 'day' && 'border-dashed',
                  )}
                >
                  <p className="font-display font-bold">{plan.name}</p>
                  <p className="mt-3 font-display text-2xl font-extrabold">
                    {formatPrice(plan.price[currency], currency)}
                    <span className="text-sm font-normal text-ink-500">/{plan.period === 'day' ? '24h' : 'mo'}</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.highlights.slice(0, 4).map((h) => (
                      <li key={h} className="flex gap-2 text-xs text-ink-300">
                        <Check className="size-3.5 shrink-0 text-spike" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <ActionButton
                    className="mt-5 w-full"
                    size="sm"
                    variant={plan.id === highlighted || plan.featured ? 'primary' : 'secondary'}
                    disabled={!canManage || (current && plan.period === 'month') || !workspace.data}
                    loading={checkout.isPending && checkout.variables?.id === plan.id}
                    onClick={() => checkout.mutate(plan)}
                  >
                    {current && plan.period === 'month' ? 'Current plan' : plan.period === 'day' && e?.day_pass_until ? 'Extend 24h' : plan.cta}
                  </ActionButton>
                </li>
              )
            })}
          </ul>
        </section>

        {/* History */}
        <section>
          <h2 className="font-display text-xl font-bold">Payment history</h2>
          <div className="card mt-4 overflow-x-auto">
            {payments.data?.length ? (
              <table className="w-full min-w-lg text-left text-sm">
                <thead className="text-xs text-ink-500">
                  <tr className="border-b border-white/6">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Item</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {payments.data.map((p) => (
                    <tr key={p.reference}>
                      <td className="px-5 py-3 text-ink-300">{dateFmt.format(new Date(p.paid_at ?? p.created_at))}</td>
                      <td className="px-5 py-3">
                        {planName(p.plan_id)}
                        <span className="text-ink-500">{p.kind === 'subscription' ? ' · monthly' : ' · 24h'}</span>
                      </td>
                      <td className="px-5 py-3">{formatPrice(p.amount / 100, p.currency)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs capitalize',
                            p.status === 'success' ? 'bg-spike/15 text-spike' : 'bg-cut/15 text-cut',
                          )}
                        >
                          {p.status === 'success' ? 'Paid' : p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-ink-500">No payments yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
