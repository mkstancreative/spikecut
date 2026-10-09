import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, Field, inputClasses } from '@/components/ui/Field'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/lib/auth'
import { billingCurrencies } from '@/lib/env'
import type { Currency } from '@/lib/pricing'
import { safeNext } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'
import { useProfile, useWorkspace } from '@/lib/workspace'

const countries: { code: string; name: string; currency: Currency }[] = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'GH', name: 'Ghana', currency: 'GHS' },
  { code: 'OTHER', name: 'Somewhere else', currency: 'USD' },
]

export default function Onboarding() {
  const { user } = useAuth()
  const profile = useProfile()
  const workspace = useWorkspace()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user || !workspace.data) return
    const form = new FormData(e.currentTarget)
    const country = countries.find((c) => c.code === form.get('country')) ?? countries[0]
    // Charge in the local currency only if our Paystack account supports it.
    const currency = billingCurrencies.includes(country.currency) ? country.currency : billingCurrencies[0]

    setSaving(true)
    setError('')
    const [p, w] = await Promise.all([
      supabase
        .from('profiles')
        .update({ full_name: String(form.get('name')).trim(), country: country.code, currency, onboarded: true, updated_at: new Date().toISOString() })
        .eq('id', user.id),
      workspace.data.role === 'owner'
        ? supabase.from('workspaces').update({ name: String(form.get('workspace')).trim() }).eq('id', workspace.data.id)
        : Promise.resolve({ error: null }),
    ])
    setSaving(false)
    if (p.error || w.error) return setError((p.error ?? w.error)!.message)
    await queryClient.invalidateQueries()
    navigate(safeNext(params.get('next')), { replace: true })
  }

  if (profile.isPending || workspace.isPending) return null

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Logo />
      <div className="card mt-8 w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold">Let’s set you up</h1>
        <p className="mt-1 text-ink-400">Thirty seconds, then you’re in.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Your name" name="name" required defaultValue={profile.data?.full_name ?? ''} autoComplete="name" />
          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-ink-300">
              Where are you based?
            </label>
            <select id="country" name="country" className={inputClasses} defaultValue="NG">
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ink-500">Sets the currency you’re billed in.</p>
          </div>
          {workspace.data?.role === 'owner' && (
            <Field
              label="Workspace name"
              name="workspace"
              required
              defaultValue={workspace.data.name}
              hint={<span className="text-xs text-ink-500">Your brand or team</span>}
            />
          )}
          <ActionButton type="submit" className="w-full" loading={saving}>
            Continue
          </ActionButton>
        </form>
      </div>
    </div>
  )
}
