import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { GoogleButton, OrDivider } from '@/components/app/GoogleButton'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, Field } from '@/components/ui/Field'
import { useAuth } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/env'
import { nextFromSearch } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [params] = useSearchParams()
  const next = nextFromSearch(params)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    setLoading(false)
    if (error) return setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
    navigate(next, { replace: true })
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New to SpikeCut?{' '}
          <Link to={`/signup?${params}`} className="text-spike hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton next={next} onError={setError} />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email" name="email" type="email" autoComplete="email" required disabled={!isSupabaseConfigured} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!isSupabaseConfigured}
          hint={
            <Link to="/forgot-password" className="text-xs text-ink-400 hover:text-spike">
              Forgot password?
            </Link>
          }
        />
        <ActionButton type="submit" className="w-full" loading={loading} disabled={!isSupabaseConfigured}>
          Log in
        </ActionButton>
      </form>
    </AuthLayout>
  )
}
