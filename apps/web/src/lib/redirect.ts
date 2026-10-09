// Only allow in-app relative redirects (prevents open-redirects via ?next=).
export function safeNext(value: string | null | undefined, fallback = '/app'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

// Signup/login links from the pricing page carry ?plan=…; send those users straight to checkout.
export function nextFromSearch(params: URLSearchParams): string {
  const plan = params.get('plan')
  if (plan) return `/app/billing?plan=${encodeURIComponent(plan)}`
  return safeNext(params.get('next'))
}

export function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
}
