import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, Field } from '@/components/ui/Field'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

// Reached from the reset email via /auth/callback, which signs the user in first.
export default function ResetPassword() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!authLoading && !user) return <Navigate to="/forgot-password" replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get('password'))
    if (password.length < 8) return setError('Use at least 8 characters.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(error.message)
    navigate('/app', { replace: true })
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <ActionButton type="submit" className="w-full" loading={loading}>
          Save password
        </ActionButton>
      </form>
    </AuthLayout>
  )
}
