import { BillingError } from '../billing'
import { getEntitlements } from '../entitlements'
import { supabaseAdmin } from '../supabase'
import { decrypt, encrypt } from './crypto'
import { googleEnabled, googleRefresh, publishYouTube } from './google'
import { metaEnabled, publishFacebook, publishInstagram } from './meta'
import { SocialError, type ConnectedAccount, type PublishInput, type PublishResult, type SocialPlatform } from './types'

export * from './types'

export function enabledProviders() {
  return { google: googleEnabled(), meta: metaEnabled() }
}

/** Store accounts from an OAuth callback, respecting the plan's social-account limit. */
export async function saveAccounts(workspaceId: string, userId: string, accounts: ConnectedAccount[]) {
  const db = supabaseAdmin()
  const ent = await getEntitlements(workspaceId)
  if (ent.planId === 'free') throw new BillingError('You need an active plan or Day Pass to connect accounts', 403)

  const { data: existing } = await db.from('social_accounts').select('platform, external_id').eq('workspace_id', workspaceId)
  const known = new Set(existing?.map((a) => `${a.platform}:${a.external_id}`))
  const fresh = accounts.filter((a) => !known.has(`${a.platform}:${a.externalId}`))
  const room = ent.limits.socialAccounts - (existing?.length ?? 0)

  // Reconnecting existing accounts always works; new ones only up to the limit.
  const toSave = [...accounts.filter((a) => known.has(`${a.platform}:${a.externalId}`)), ...fresh.slice(0, Math.max(0, room))]
  const skipped = fresh.length - Math.max(0, Math.min(room, fresh.length))

  for (const a of toSave) {
    const { error } = await db.from('social_accounts').upsert(
      {
        workspace_id: workspaceId,
        platform: a.platform,
        external_id: a.externalId,
        display_name: a.displayName,
        handle: a.handle,
        avatar_url: a.avatarUrl,
        access_token_enc: await encrypt(a.accessToken),
        // Google only sends a refresh token on first consent — don't wipe a stored one.
        ...(a.refreshToken ? { refresh_token_enc: await encrypt(a.refreshToken) } : {}),
        token_expires_at: a.tokenExpiresAt ?? null,
        meta: a.meta ?? {},
        status: 'active',
        last_error: null,
        connected_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,platform,external_id' },
    )
    if (error) throw error
  }
  return { saved: toSave.length, skipped }
}

type AccountRow = {
  id: string
  platform: SocialPlatform
  external_id: string
  meta: Record<string, unknown>
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expires_at: string | null
}

/** A usable access token, refreshing Google tokens that are about to expire. */
async function accessTokenFor(acc: AccountRow): Promise<string> {
  const token = await decrypt(acc.access_token_enc)
  const expiresSoon = acc.token_expires_at && new Date(acc.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000
  if (acc.platform === 'youtube' && (expiresSoon || !token)) {
    const refresh = await decrypt(acc.refresh_token_enc)
    if (!refresh) throw new SocialError('YouTube access expired — reconnect the channel', true)
    const fresh = await googleRefresh(refresh)
    await supabaseAdmin()
      .from('social_accounts')
      .update({ access_token_enc: await encrypt(fresh.accessToken), token_expires_at: fresh.expiresAt })
      .eq('id', acc.id)
    return fresh.accessToken
  }
  if (!token) throw new SocialError('Account needs reconnecting', true)
  return token
}

export async function publishTo(acc: AccountRow, post: Omit<PublishInput, 'accessToken' | 'account'>): Promise<PublishResult> {
  const input: PublishInput = { ...post, accessToken: await accessTokenFor(acc), account: acc }
  if (acc.platform === 'youtube') return publishYouTube(input)
  if (acc.platform === 'instagram') return publishInstagram(input)
  if (acc.platform === 'facebook') return publishFacebook(input)
  throw new SocialError(`${acc.platform} publishing isn't available yet`)
}
