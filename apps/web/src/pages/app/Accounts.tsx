import { AlertTriangle, Link2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/AppLayout'
import { ActionButton } from '@/components/ui/ActionButton'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Alert } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { socialMeta, useProviders, useSocialAccounts, useSocialActions, type SocialAccount } from '@/lib/social'
import { useEntitlements, useWorkspace } from '@/lib/workspace'

const providers = [
  {
    id: 'google' as const,
    name: 'YouTube',
    blurb: 'Post clips as YouTube Shorts on your channel.',
    dot: 'bg-red-500',
    note: 'Google may show an “unverified app” warning while SpikeCut is in testing — choose Advanced → Continue.',
  },
  {
    id: 'meta' as const,
    name: 'Instagram & Facebook',
    blurb: 'Post Reels to Instagram professional accounts and videos to Facebook Pages.',
    dot: 'bg-pink-500',
    note: 'Your Instagram must be a Business or Creator account linked to a Facebook Page.',
  },
]

function AccountRow({ account, onDisconnect, busy }: { account: SocialAccount; onDisconnect: () => void; busy: boolean }) {
  const meta = socialMeta[account.platform]
  const confirm = useConfirm()
  return (
    <li className="flex items-center gap-3 rounded-xl bg-ink-850 p-3">
      {account.avatar_url ? (
        <img src={account.avatar_url} alt="" className="size-10 rounded-full object-cover" />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-full bg-ink-800 font-bold">{account.display_name[0]}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{account.display_name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
          <span className={cn('size-1.5 rounded-full', meta.dot)} />
          {meta.label}
          {account.handle && <span className="truncate">· {account.handle}</span>}
          {account.meta.pageName && <span className="truncate">· via {account.meta.pageName}</span>}
        </p>
        {account.status === 'reconnect' && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-cut">
            <AlertTriangle className="size-3" /> Needs reconnecting{account.last_error ? ` — ${account.last_error}` : ''}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const ok = await confirm({
            title: `Disconnect ${account.display_name}?`,
            body: 'Scheduled posts to this account are removed. You can reconnect it any time.',
            confirmLabel: 'Disconnect',
            tone: 'danger',
          })
          if (ok) onDisconnect()
        }}
        title="Disconnect"
        className="rounded-lg p-2 text-ink-400 hover:bg-cut/10 hover:text-cut disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}

export default function Accounts() {
  const workspace = useWorkspace()
  const wsId = workspace.data?.id
  const ent = useEntitlements(wsId)
  const accounts = useSocialAccounts(wsId)
  const available = useProviders()
  const { connect, disconnect } = useSocialActions(wsId)
  const [params, setParams] = useSearchParams()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Result of the OAuth round-trip: /app/accounts?connected=2&skipped=1 or ?error=…
  useEffect(() => {
    const connected = params.get('connected')
    const skipped = Number(params.get('skipped') ?? 0)
    const error = params.get('error')
    if (!connected && !error) return
    if (error) setNotice({ tone: 'error', text: error })
    else
      setNotice({
        tone: skipped ? 'info' : 'success',
        text: `Connected ${connected} account${connected === '1' ? '' : 's'}.${skipped ? ` ${skipped} more didn’t fit your plan’s account limit.` : ''}`,
      })
    setParams({}, { replace: true })
  }, [params, setParams])

  const limit = ent.data?.limits.socialAccounts ?? 0
  const count = accounts.data?.length ?? 0
  const err = (connect.error ?? disconnect.error) as Error | null

  return (
    <>
      <PageHeader title="Connected accounts" description={`Where SpikeCut publishes your clips · ${count} / ${limit}`} />
      <div className="space-y-8 p-4 sm:p-8">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {err && <Alert>{err.message}</Alert>}
        {count >= limit && limit > 0 && (
          <Alert tone="info">You’ve reached your plan’s limit of {limit} accounts. Disconnect one or upgrade to add more.</Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => {
            const mine = accounts.data?.filter((a) => socialMeta[a.platform].provider === p.id) ?? []
            const ready = available.data?.[p.id]
            return (
              <section key={p.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                      <span className={cn('size-2.5 rounded-full', p.dot)} />
                      {p.name}
                    </h2>
                    <p className="mt-1 text-sm text-ink-400">{p.blurb}</p>
                  </div>
                  <ActionButton
                    size="sm"
                    variant={mine.length ? 'secondary' : 'primary'}
                    loading={connect.isPending && connect.variables === p.id}
                    disabled={!ready || !wsId}
                    onClick={() => connect.mutate(p.id)}
                  >
                    <Link2 className="size-3.5" /> {mine.length ? 'Add / reconnect' : 'Connect'}
                  </ActionButton>
                </div>
                {available.data && !ready && (
                  <p className="mt-3 text-xs text-ink-500">Not set up on the server yet — add the app keys to .env.local.</p>
                )}
                {mine.length ? (
                  <ul className="mt-4 space-y-2">
                    {mine.map((a) => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        busy={disconnect.isPending && disconnect.variables === a.id}
                        onDisconnect={() => disconnect.mutate(a.id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-ink-500">Nothing connected yet</p>
                )}
                <p className="mt-4 text-xs text-ink-500">{p.note}</p>
              </section>
            )
          })}
        </div>

        <section className="card flex items-center justify-between gap-4 p-5 opacity-70">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <span className="size-2.5 rounded-full bg-ink-400" /> TikTok
            </h2>
            <p className="mt-1 text-sm text-ink-400">Direct posting arrives once TikTok approves our app.</p>
          </div>
          <span className="rounded-full bg-white/6 px-3 py-1 font-mono text-[10px] tracking-wider text-ink-400 uppercase">Soon</span>
        </section>
      </div>
    </>
  )
}
