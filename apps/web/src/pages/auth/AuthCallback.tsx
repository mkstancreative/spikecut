import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { safeNext } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

// Landing point for Google sign-in, email confirmation and password reset links.
// supabase-js exchanges the ?code= for a session automatically (detectSessionInUrl).
export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(params.get('error_description') ?? '')

  useEffect(() => {
    if (error) return
    const next = safeNext(params.get('next'))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate(next, { replace: true })
    })
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) setError(error.message)
      else if (session) navigate(next, { replace: true })
    })
    const timeout = setTimeout(() => setError('That link has expired or was already used.'), 10000)
    return () => {
      data.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [error, navigate, params])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      {error ? (
        <>
          <p className="text-cut">{error}</p>
          <Link to="/login" className="text-spike hover:underline">
            Back to log in
          </Link>
        </>
      ) : (
        <>
          <LoaderCircle className="size-6 animate-spin text-spike" />
          <p className="text-ink-400">Signing you in…</p>
        </>
      )}
    </div>
  )
}
