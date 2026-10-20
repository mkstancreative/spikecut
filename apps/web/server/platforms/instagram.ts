import { decrypt } from '../social/crypto'
import { supabaseAdmin } from '../supabase'
import { PlatformError, type ResolvedChannel, type StreamSnapshot } from './types'

/**
 * Instagram creators are read through Business Discovery, using an Instagram professional account the workspace
 * has connected on the Accounts page. Only business/creator profiles can be looked up this way.
 */

const version = () => process.env.META_GRAPH_VERSION?.trim() || 'v23.0'

export function parseInstagram(input: string): string | null {
  const raw = input.trim()
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    if (!/(^|\.)instagram\.com$/.test(url.hostname)) return null
    const user = url.pathname.split('/').filter(Boolean)[0]
    return user && /^[\w.]{1,30}$/.test(user) && !['p', 'reel', 'reels', 'stories', 'explore'].includes(user) ? user.toLowerCase() : null
  } catch {
    return null
  }
}

async function lookupAccount(workspaceId: string) {
  const { data, error } = await supabaseAdmin()
    .from('social_accounts')
    .select('external_id, access_token_enc')
    .eq('workspace_id', workspaceId)
    .eq('platform', 'instagram')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const token = await decrypt(data?.access_token_enc)
  if (!data || !token) {
    throw new PlatformError('Connect an Instagram professional account on the Accounts page first — SpikeCut uses it to watch Instagram creators')
  }
  return { igId: data.external_id as string, token }
}

type Media = {
  id: string
  caption?: string
  media_type: string
  media_product_type?: string
  permalink: string
  thumbnail_url?: string
  timestamp: string
}
type Profile = { username: string; name?: string; profile_picture_url?: string; media?: { data: Media[] } }

async function discover(workspaceId: string, username: string, limit: number): Promise<Profile> {
  const { igId, token } = await lookupAccount(workspaceId)
  const fields = `business_discovery.username(${username}){username,name,profile_picture_url,media.limit(${limit}){id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp}}`
  const res = await fetch(`https://graph.facebook.com/${version()}/${igId}?${new URLSearchParams({ fields, access_token: token })}`)
  const json = await res.json()
  if (!res.ok || json.error) {
    const e = json.error ?? {}
    if (e.code === 10 || e.code === 200) {
      throw new PlatformError('Instagram: SpikeCut needs the instagram_manage_insights permission — add it in Meta and reconnect Instagram')
    }
    if (e.code === 110 || e.error_subcode === 2207013) throw new PlatformError(`Instagram: @${username} isn’t a public business or creator account`)
    throw new PlatformError(`Instagram: ${e.error_user_msg ?? e.message ?? res.statusText}`)
  }
  return json.business_discovery as Profile
}

export async function resolveInstagram(input: string, workspaceId: string): Promise<ResolvedChannel> {
  const username = parseInstagram(input)
  if (!username) throw new PlatformError('That doesn’t look like an Instagram profile link — e.g. instagram.com/creator')
  const p = await discover(workspaceId, username, 1)
  return {
    platform: 'instagram',
    channelId: p.username.toLowerCase(),
    handle: `@${p.username}`,
    displayName: p.name || `@${p.username}`,
    avatarUrl: p.profile_picture_url ?? null,
    channelUrl: `https://www.instagram.com/${p.username}/`,
  }
}

/** Latest videos/Reels for each username, looked up with this workspace's connected account. */
export async function fetchInstagram(usernames: string[], workspaceId: string, perChannel = 12): Promise<Map<string, StreamSnapshot[]>> {
  const result = new Map<string, StreamSnapshot[]>()
  for (const username of usernames) {
    const p = await discover(workspaceId, username, perChannel)
    result.set(
      username,
      (p.media?.data ?? [])
        .filter((m) => m.media_type === 'VIDEO')
        .map((m) => ({
          externalId: m.id,
          kind: 'upload',
          status: 'available',
          title: m.caption?.split('\n')[0].slice(0, 200) || null,
          thumbnailUrl: m.thumbnail_url ?? null,
          url: m.permalink,
          viewerCount: null,
          durationSeconds: null,
          startedAt: null,
          endedAt: null,
          publishedAt: m.timestamp,
        })),
    )
  }
  return result
}
