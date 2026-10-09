import { MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { GoogleButton, OrDivider } from '@/components/app/GoogleButton'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, Field } from '@/components/ui/Field'
import { useAuth } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/env'
import { getPlan } from '@/lib/pricing'
import { callbackUrl, nextFromSearch } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

export default function Signup() {
  const [params] = useSearchParams()
  const next = nextFromSearch(params)
  const plan = getPlan(params.get('plan') ?? '')
  const navigate = useNavigate()
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState('')

  if (user) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    if (password.length < 8) return setError('Use at least 8 characters for your password.')

    setError('')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: String(form.get('name')).trim() }, emailRedirectTo: callbackUrl(next) },
    })
    setLoading(false)
    if (error) return setError(error.message)
    // With "Confirm email" on (Supabase default) there's no session until the link is clicked.
    if (data.session) navigate(next, { replace: true })
    else setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your inbox">
        <div className="card p-6">
          <MailCheck className="size-8 text-spike" />
          <p className="mt-4 text-ink-300">
            We sent a confirmation link to <span className="font-semibold text-ink-100">{sentTo}</span>. Open it on this
            device to finish creating your account.
          </p>
          <p className="mt-4 text-sm text-ink-500">Nothing after a few minutes? Check spam, or try signing up again.</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        plan ? (
          <>
            You’re signing up for <span className="text-ink-100">{plan.name}</span>. Checkout comes right after.
          </>
        ) : (
          <>
            Already have one?{' '}
            <Link to={`/login?${params}`} className="text-spike hover:underline">
              Log in
            </Link>
          </>
        )
      }
    >
      <GoogleButton next={next} onError={setError} />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Your name" name="name" autoComplete="name" required disabled={!isSupabaseConfigured} />
        <Field label="Email" name="email" type="email" autoComplete="email" required disabled={!isSupabaseConfigured} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={!isSupabaseConfigured}
          hint={<span className="text-xs text-ink-500">8+ characters</span>}
        />
        <ActionButton type="submit" className="w-full" loading={loading} disabled={!isSupabaseConfigured}>
          Create account
        </ActionButton>
        <p className="text-center text-xs text-ink-500">
          By continuing you agree to our{' '}
          <Link to="/terms" className="underline hover:text-ink-300">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="underline hover:text-ink-300">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  )
}
