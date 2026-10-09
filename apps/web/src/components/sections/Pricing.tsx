import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { cn } from '@/lib/cn'
import { billingCurrencies } from '@/lib/env'
import { currencies, formatPrice, guessCurrency, plans, type Currency } from '@/lib/pricing'

const dayPass = plans.find((p) => p.period === 'day')
const monthly = plans.filter((p) => p.period === 'month')

function PriceTag({ amount, currency, period, className }: { amount: number; currency: Currency; period: string; className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-1', className)}>
      <span className="font-display text-3xl font-extrabold tracking-tight">{formatPrice(amount, currency)}</span>
      <span className="text-sm text-ink-500">/{period}</span>
    </p>
  )
}

export function Pricing() {
  const [currency, setCurrency] = useState<Currency>(() => guessCurrency(billingCurrencies))
  const shown = currencies.filter((c) => billingCurrencies.includes(c.code))

  return (
    <section id="pricing" className="container-page py-24 sm:py-32">
      <div className="flex flex-col items-center gap-8 text-center">
        <SectionHeading
          eyebrow="Pricing"
          title="Pay for a day, or run it every day."
          intro="Grab a Day Pass when you need a quick session, or pick a monthly plan when you’re posting daily. Every plan exports clean — no watermark."
          align="center"
        />
        {shown.length > 1 && (
        <div role="radiogroup" aria-label="Currency" className="inline-flex rounded-full border border-white/10 bg-ink-900 p-1">
          {shown.map((c) => (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={currency === c.code}
              onClick={() => setCurrency(c.code)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                currency === c.code ? 'bg-spike text-ink-950' : 'text-ink-400 hover:text-ink-100',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {dayPass && (
        <div className="card mt-14 flex flex-col gap-6 border-dashed p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <h3 className="font-display text-lg font-bold">{dayPass.name}</h3>
            <p className="mt-1 text-sm text-ink-400">{dayPass.blurb}</p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:max-w-sm">
            {dayPass.highlights.map((h) => (
              <li key={h} className="flex gap-1.5 text-sm text-ink-300">
                <Check className="mt-0.5 size-4 shrink-0 text-spike" />
                {h}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-5 lg:flex-col lg:items-end lg:gap-3">
            <PriceTag amount={dayPass.price[currency]} currency={currency} period="24h" />
            <Button to={`/signup?plan=${dayPass.id}`} variant="secondary">
              {dayPass.cta}
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {monthly.map((plan) => (
          <li
            key={plan.id}
            className={cn(
              'card relative flex flex-col p-6',
              plan.featured && 'border-spike/50 bg-linear-to-b from-spike/[0.07] to-ink-900',
            )}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-spike px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-ink-950 uppercase">
                Most popular
              </span>
            )}
            <h3 className="font-display text-lg font-bold">{plan.name}</h3>
            <p className="mt-1 min-h-10 text-sm text-ink-400">{plan.blurb}</p>
            <PriceTag amount={plan.price[currency]} currency={currency} period="mo" className="mt-5" />
            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-sm text-ink-300">
                  <Check className="mt-0.5 size-4 shrink-0 text-spike" />
                  {h}
                </li>
              ))}
            </ul>
            <Button
              to={`/signup?plan=${plan.id}`}
              variant={plan.featured ? 'primary' : 'secondary'}
              className="mt-8 w-full"
            >
              {plan.cta}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-sm text-ink-500">
        Payments are processed securely by Paystack. Cards, bank transfer and mobile money accepted. Cancel monthly plans anytime.
      </p>
    </section>
  )
}
