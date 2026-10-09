import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, Field } from '@/components/ui/Field'
import { isSupabaseConfigured } from '@/lib/env'
import { callbackUrl } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

export default function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(String(new FormData(e.currentTarget).get('email')), {
      redirectTo: callbackUrl('/reset-password'),
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        <Link to="/login" className="text-spike hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">If that email has an account, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email" name="email" type="email" autoComplete="email" required disabled={!isSupabaseConfigured} />
          <ActionButton type="submit" className="w-full" loading={loading} disabled={!isSupabaseConfigured}>
            Send reset link
          </ActionButton>
        </form>
      )}
    </AuthLayout>
  )
}
