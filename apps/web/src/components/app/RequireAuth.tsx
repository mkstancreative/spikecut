import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/lib/auth'
import { useProfile } from '@/lib/workspace'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoaderCircle className="size-6 animate-spin text-spike" />
    </div>
  )
}

// Signed-out users go to /login; signed-in users who haven't finished onboarding go to /app/welcome.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const profile = useProfile()
  const location = useLocation()
  const here = location.pathname + location.search

  if (loading || (user && profile.isPending)) return <FullPageSpinner />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />
  if (profile.data && !profile.data.onboarded && location.pathname !== '/app/welcome') {
    return <Navigate to={`/app/welcome?next=${encodeURIComponent(here)}`} replace />
  }
  return children
}
