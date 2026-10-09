import { useState } from 'react'
import { ActionButton } from '@/components/ui/ActionButton'
import { GoogleIcon } from '@/components/ui/GoogleIcon'
import { isSupabaseConfigured } from '@/lib/env'
import { callbackUrl } from '@/lib/redirect'
import { supabase } from '@/lib/supabase'

export function GoogleButton({ next, onError }: { next: string; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    })
    if (error) {
      setLoading(false)
      onError(error.message)
    }
  }

  return (
    <ActionButton variant="secondary" className="w-full" loading={loading} disabled={!isSupabaseConfigured} onClick={signIn}>
      {!loading && <GoogleIcon className="size-4" />}
      Continue with Google
    </ActionButton>
  )
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-ink-500">
      <span className="h-px flex-1 bg-white/8" />
      or with email
      <span className="h-px flex-1 bg-white/8" />
    </div>
  )
}
