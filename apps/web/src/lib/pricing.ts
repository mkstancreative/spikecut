// Shared by the web app and the API server — keep this file free of browser/Node-only APIs.

export type Currency = 'NGN' | 'GHS' | 'USD'

export const currencies: { code: Currency; label: string }[] = [
  { code: 'NGN', label: '₦ NGN' },
  { code: 'GHS', label: '₵ GHS' },
  { code: 'USD', label: '$ USD' },
]

// Paystack only charges currencies enabled on the merchant account, so the list is configurable
// (VITE_BILLING_CURRENCIES in the browser, BILLING_CURRENCIES on the server). Default: NGN.
export function parseCurrencies(value: string | undefined): Currency[] {
  const codes = (value ?? 'NGN')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is Currency => currencies.some((x) => x.code === c))
  return codes.length ? codes : ['NGN']
}

// 'free' is what the database reports when a workspace has no active plan or Day Pass.
// There's no free tier: such workspaces are sent to Billing (see RequirePlan).
export type PlanId = 'free' | 'day-pass' | 'starter' | 'creator' | 'pro' | 'agency'

export type Limits = {
  clips: number // render credits granted per period
  creators: number
  socialAccounts: number
  seats: number
}

export type Plan = {
  id: Exclude<PlanId, 'free'>
  name: string
  blurb: string
  period: 'day' | 'month'
  // Prices are set per currency (not FX-converted) so they stay round and Paystack-friendly.
  price: Record<Currency, number>
  limits: Limits
  highlights: string[]
  cta: string
  featured?: boolean
}

export const noPlanLimits: Limits = { clips: 0, creators: 0, socialAccounts: 0, seats: 1 }

export const plans: Plan[] = [
  {
    id: 'day-pass',
    name: 'Day Pass',
    blurb: 'Full access for 24 hours. No subscription, no renewal.',
    period: 'day',
    price: { NGN: 4500, GHS: 35, USD: 3 },
    limits: { clips: 15, creators: 3, socialAccounts: 3, seats: 1 },
    highlights: ['24-hour unlock', '3 creators watched', '15 clips', 'Captions + clean exports', 'Publish to your socials'],
    cta: 'Get a day pass',
  },
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For clippers building a daily posting habit.',
    period: 'month',
    price: { NGN: 12000, GHS: 95, USD: 8 },
    limits: { clips: 40, creators: 3, socialAccounts: 3, seats: 1 },
    highlights: ['40 clips / month', '3 creators watched', '3 social accounts', 'Auto captions', 'Scheduled publishing'],
    cta: 'Start Starter',
  },
  {
    id: 'creator',
    name: 'Creator',
    blurb: 'For clippers running several channels every week.',
    period: 'month',
    price: { NGN: 25000, GHS: 199, USD: 17 },
    limits: { clips: 175, creators: 10, socialAccounts: 8, seats: 1 },
    highlights: ['175 clips / month', '10 creators watched', '8 social accounts', 'Everything in Starter', 'Custom caption styles'],
    cta: 'Start Creator',
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'High daily output with priority rendering.',
    period: 'month',
    price: { NGN: 52000, GHS: 399, USD: 35 },
    limits: { clips: 550, creators: 25, socialAccounts: 20, seats: 3 },
    highlights: ['550 clips / month', '25 creators watched', '3 seats', 'Priority render queue', 'Analytics + brand kits'],
    cta: 'Start Pro',
  },
  {
    id: 'agency',
    name: 'Agency',
    blurb: 'Client workspaces for clipping teams at scale.',
    period: 'month',
    price: { NGN: 135000, GHS: 990, USD: 89 },
    limits: { clips: 2200, creators: 100, socialAccounts: 100, seats: 10 },
    highlights: ['2,200 clips / month', '100 creators watched', '10 seats', 'Client workspaces', 'Bulk scheduling'],
    cta: 'Start Agency',
  },
]

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id)
}

export function planName(id: PlanId | string): string {
  return id === 'free' ? 'No plan' : (getPlan(id)?.name ?? id)
}

export function limitsFor(id: PlanId | string): Limits {
  return getPlan(id)?.limits ?? noPlanLimits
}

export function formatPrice(amount: number, currency: Currency) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amount)
}

// Best-effort guess from the browser timezone, constrained to what we can actually charge.
export function guessCurrency(enabled: Currency[]): Currency {
  let guess: Currency = 'USD'
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz === 'Africa/Lagos') guess = 'NGN'
    else if (tz === 'Africa/Accra') guess = 'GHS'
  } catch {
    /* fall through */
  }
  return enabled.includes(guess) ? guess : enabled[0]
}
