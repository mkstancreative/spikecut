import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { Alert, Field } from '@/components/ui/Field'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useProfile, useWorkspace } from '@/lib/workspace'

export default function Settings() {
  const { user } = useAuth()
  const profile = useProfile()
  const workspace = useWorkspace()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user || !workspace.data) return
    const form = new FormData(e.currentTarget)
    setSaving(true)
    const results = await Promise.all([
      supabase.from('profiles').update({ full_name: String(form.get('name')).trim(), updated_at: new Date().toISOString() }).eq('id', user.id),
      workspace.data.role === 'owner'
        ? supabase.from('workspaces').update({ name: String(form.get('workspace')).trim() }).eq('id', workspace.data.id)
        : Promise.resolve({ error: null }),
    ])
    setSaving(false)
    const error = results.find((r) => r.error)?.error
    setStatus(error ? { tone: 'error', text: error.message } : { tone: 'success', text: 'Saved.' })
    if (!error) queryClient.invalidateQueries()
  }

  if (profile.isPending || workspace.isPending) return null

  return (
    <>
      <PageHeader title="Settings" description="Your profile and workspace." />
      <div className="p-4 sm:p-8">
        <form onSubmit={onSubmit} className="card max-w-xl space-y-5 p-6">
          {status && <Alert tone={status.tone}>{status.text}</Alert>}
          <Field label="Name" name="name" defaultValue={profile.data?.full_name ?? ''} required />
          <Field label="Email" name="email" value={user?.email ?? ''} disabled readOnly />
          <Field
            label="Workspace name"
            name="workspace"
            defaultValue={workspace.data?.name}
            disabled={workspace.data?.role !== 'owner'}
            required
          />
          <ActionButton type="submit" loading={saving}>
            Save changes
          </ActionButton>
        </form>
      </div>
    </>
  )
}
