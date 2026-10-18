import { redirectUri, SocialError, type ConnectedAccount, type PublishInput, type PublishResult } from './types'

// user.info.basic for the name/avatar; video.publish to Direct Post. Until TikTok audits the app,
// Direct Post only allows private (SELF_ONLY) posts — creator_info tells us what's allowed.
const SCOPES = ['user.info.basic', 'video.publish']
const API = 'https://open.tiktokapis.com/v2'

export const tiktokEnabled = () => Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim())
const clientKey = () => process.env.TIKTOK_CLIENT_KEY!.trim()
const clientSecret = () => process.env.TIKTOK_CLIENT_SECRET!.trim()

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'

export function tiktokAuthUrl(state: string) {
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.search = new URLSearchParams({
    client_key: clientKey(),
    redirect_uri: redirectUri('tiktok'),
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  }).toString()
  return url.toString()
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  open_id: string
  error?: string
  error_description?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), ...body }),
  })
  const json = (await res.json()) as TokenResponse
  if (!res.ok || json.error) {
    throw new SocialError(`TikTok: ${json.error_description || json.error || res.statusText}`, json.error === 'invalid_grant')
  }
  return json
}

/** TikTok wraps every API answer as { data, error: { code: 'ok' | …, message } }. */
async function call<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } }
  const code = json.error?.code
  if (!res.ok || (code && code !== 'ok')) {
    throw new SocialError(`TikTok: ${json.error?.message || code || res.statusText}`, code === 'access_token_invalid' || res.status === 401)
  }
  return json.data as T
}

export async function tiktokExchange(code: string): Promise<ConnectedAccount[]> {
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri('tiktok') })
  const { user } = await call<{ user: { open_id: string; display_name: string; avatar_url?: string } }>(
    '/user/info/?fields=open_id,display_name,avatar_url',
    tokens.access_token,
  )
  return [
    {
      platform: 'tiktok',
      externalId: user.open_id ?? tokens.open_id,
      displayName: user.display_name || 'TikTok account',
      handle: null,
      avatarUrl: user.avatar_url ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
  ]
}

/** Access tokens last a day; TikTok may hand back a new refresh token too. */
export async function tiktokRefresh(refreshToken: string) {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() }
}

type CreatorInfo = { creator_username?: string; privacy_level_options: TikTokPrivacy[]; max_video_post_duration_sec?: number }

const MB = 1024 * 1024
const CHUNK = 10 * MB // TikTok wants 5–64 MB chunks; the last one absorbs the remainder (up to 128 MB)

/** Direct Post via FILE_UPLOAD — Storage links can't pass TikTok's URL-ownership check for PULL_FROM_URL. */
export async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  const creator = await call<CreatorInfo>('/post/publish/creator_info/query/', input.accessToken, {})
  const wanted = (input.options?.privacyLevel as TikTokPrivacy | undefined) ?? 'SELF_ONLY'
  const privacy = creator.privacy_level_options.includes(wanted) ? wanted : null
  if (!privacy) {
    throw new SocialError(
      creator.privacy_level_options.length === 1 && creator.privacy_level_options[0] === 'SELF_ONLY'
        ? 'TikTok only allows private (“Only me”) posts until SpikeCut’s app is approved — schedule it again as Only me.'
        : 'That TikTok privacy setting isn’t available for this account any more — pick another.',
    )
  }

  const video = await fetch(input.videoUrl)
  if (!video.ok) throw new SocialError(`Couldn't read the clip file (${video.status})`)
  const bytes = new Uint8Array(await video.arrayBuffer())
  const size = bytes.byteLength
  const chunk = size <= CHUNK ? size : CHUNK
  const chunks = Math.max(1, Math.floor(size / chunk))

  const caption = [input.title, input.caption].filter(Boolean).join('\n\n').slice(0, 2200)
  const init = await call<{ publish_id: string; upload_url: string }>('/post/publish/video/init/', input.accessToken, {
    post_info: { title: caption, privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: chunks },
  })

  for (let i = 0; i < chunks; i++) {
    const start = i * chunk
    const end = i === chunks - 1 ? size : start + chunk
    const res = await fetch(init.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end - 1}/${size}` },
      body: bytes.subarray(start, end),
    })
    if (!res.ok) throw new SocialError(`TikTok upload failed at part ${i + 1}/${chunks} (${res.status})`)
  }

  // TikTok processes the video after upload; wait a little for the post id, but don't hold the worker for ages.
  for (let tries = 0; tries < 24; tries++) {
    await new Promise((r) => setTimeout(r, 5000))
    const status = await call<{ status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>(
      '/post/publish/status/fetch/',
      input.accessToken,
      { publish_id: init.publish_id },
    )
    if (status.status === 'FAILED') throw new SocialError(`TikTok rejected the video: ${status.fail_reason ?? 'unknown reason'}`)
    if (status.status === 'PUBLISH_COMPLETE') {
      const postId = status.publicaly_available_post_id?.[0]
      const user = creator.creator_username
      return {
        postId: String(postId ?? init.publish_id),
        permalink: postId && user ? `https://www.tiktok.com/@${user}/video/${postId}` : null,
      }
    }
  }
  // Still processing — TikTok finishes it on its side.
  return { postId: init.publish_id, permalink: null }
}
