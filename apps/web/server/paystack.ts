import { serverEnv } from './env'

const BASE = 'https://api.paystack.co'

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function paystack<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${serverEnv.paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T }
  if (!res.ok || !json.status) {
    throw new PaystackError(json.message ?? `Paystack ${path} failed`, res.status)
  }
  return json.data as T
}

// Paystack signs webhook bodies with HMAC-SHA512 using the secret key.
export async function verifyPaystackSignature(rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serverEnv.paystackSecretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signature.toLowerCase())
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── Response shapes (only the fields we use)

export type PaystackCustomer = { id: number; customer_code: string; email: string }

export type PaystackPlanRef = { id?: number; plan_code?: string } | null

export type PaystackTransaction = {
  id: number
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'reversed'
  reference: string
  amount: number
  currency: string
  paid_at: string | null
  metadata: unknown
  customer: PaystackCustomer
  plan?: PaystackPlanRef | string
  plan_object?: PaystackPlanRef
}

export type PaystackSubscription = {
  id: number
  subscription_code: string
  email_token: string
  status: string
  next_payment_date: string | null
  createdAt?: string
  plan: { plan_code: string } | number
  customer: PaystackCustomer | number
}

export function planCodeOf(tx: PaystackTransaction): string | undefined {
  if (typeof tx.plan === 'string' && tx.plan.startsWith('PLN_')) return tx.plan
  if (tx.plan && typeof tx.plan === 'object' && tx.plan.plan_code) return tx.plan.plan_code
  return tx.plan_object?.plan_code ?? undefined
}
