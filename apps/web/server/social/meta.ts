import { redirectUri, SocialError, type ConnectedAccount, type PublishInput, type PublishResult } from './types'

// Facebook Login covers both Facebook Pages and the Instagram professional accounts linked to them.
const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
]

export const metaEnabled = () => Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim())
const version = () => process.env.META_GRAPH_VERSION?.trim() || 'v23.0'
const graph = (path: string) => `https://graph.facebook.com/${version()}/${path.replace(/^\//, '')}`

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json()
  if (!res.ok || json.error) {
    const e = json.error ?? {}
    // 190 = expired/revoked token → the user must reconnect.
    throw new SocialError(`Meta: ${e.error_user_msg ?? e.message ?? res.statusText}`, e.code === 190)
  }
  return json as T
}

export function metaAuthUrl(state: string) {
  const url = new URL(`https://www.facebook.com/${version()}/dialog/oauth`)
  // "Facebook Login for Business" apps can use a saved Login configuration (config_id) instead of a scope list.
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim()
  url.search = new URLSearchParams({
    client_id: process.env.META_APP_ID!.trim(),
    redirect_uri: redirectUri('meta'),
    state,
    response_type: 'code',
    ...(configId ? { config_id: configId, override_default_response_type: 'true' } : { scope: SCOPES.join(',') }),
  }).toString()
  return url.toString()
}

type Page = {
  id: string
  name: string
  access_token: string
  picture?: { data?: { url?: string } }
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string }
}

export async function metaExchange(code: string): Promise<ConnectedAccount[]> {
  const appId = process.env.META_APP_ID!.trim()
  const secret = process.env.META_APP_SECRET!.trim()
  const short = await call<{ access_token: string }>(
    graph(`oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirectUri('meta'), code })}`),
  )
  // Long-lived user token → page tokens derived from it don't expire.
  const long = await call<{ access_token: string }>(
    graph(`oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: short.access_token })}`),
  )
  const pages = await call<{ data: Page[] }>(
    graph(
      `me/accounts?${new URLSearchParams({
        fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
        limit: '100',
        access_token: long.access_token,
      })}`,
    ),
  )
  if (!pages.data.length) {
    throw new SocialError('No Facebook Pages found. Instagram posting needs a professional account linked to a Facebook Page.')
  }

  const accounts: ConnectedAccount[] = []
  for (const page of pages.data) {
    accounts.push({
      platform: 'facebook',
      externalId: page.id,
      displayName: page.name,
      handle: null,
      avatarUrl: page.picture?.data?.url ?? null,
      accessToken: page.access_token,
    })
    const ig = page.instagram_business_account
    if (ig) {
      accounts.push({
        platform: 'instagram',
        externalId: ig.id,
        displayName: ig.name || ig.username || page.name,
        handle: ig.username ? `@${ig.username}` : null,
        avatarUrl: ig.profile_picture_url ?? null,
        accessToken: page.access_token, // IG Graph calls use the linked page's token
        meta: { pageId: page.id, pageName: page.name },
      })
    }
  }
  return accounts
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Reels: create a container from a public video URL, wait for Instagram to process it, then publish. */
export async function publishInstagram(input: PublishInput): Promise<PublishResult> {
  const ig = input.account.external_id
  const token = input.accessToken
  const container = await call<{ id: string }>(graph(`${ig}/media`), {
    method: 'POST',
    body: new URLSearchParams({ media_type: 'REELS', video_url: input.videoUrl, caption: input.caption.slice(0, 2200), share_to_feed: 'true', access_token: token }),
  })

  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    const s = await call<{ status_code: string; status?: string }>(graph(`${container.id}?fields=status_code,status&access_token=${token}`))
    if (s.status_code === 'FINISHED') break
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new SocialError(`Instagram couldn't process the video: ${s.status ?? s.status_code}`)
    if (i === 59) throw new SocialError('Instagram took too long to process the video')
  }

  const published = await call<{ id: string }>(graph(`${ig}/media_publish`), {
    method: 'POST',
    body: new URLSearchParams({ creation_id: container.id, access_token: token }),
  })
  const info = await call<{ permalink?: string }>(graph(`${published.id}?fields=permalink&access_token=${token}`)).catch(() => ({}) as { permalink?: string })
  return { postId: published.id, permalink: info.permalink ?? null }
}

/**
 * Facebook Reels: start an upload session, have Meta pull the video from its URL, then publish.
 * Unlike POST /{page}/videos this only needs pages_manage_posts (no publish_video, which Business Login apps can't get).
 */
export async function publishFacebook(input: PublishInput): Promise<PublishResult> {
  const page = input.account.external_id
  const token = input.accessToken
  const reels = graph(`${page}/video_reels`)

  const { video_id } = await call<{ video_id: string }>(reels, {
    method: 'POST',
    body: new URLSearchParams({ upload_phase: 'start', access_token: token }),
  })

  const upload = await fetch(`https://rupload.facebook.com/video-upload/${version()}/${video_id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: input.videoUrl },
  })
  const uploaded = await upload.json().catch(() => ({}))
  if (!upload.ok || !uploaded.success) {
    const msg = uploaded.debug_info?.message ?? uploaded.error?.message ?? upload.statusText
    throw new SocialError(`Meta: Reel upload failed: ${msg}`)
  }

  await call<{ success: boolean }>(reels, {
    method: 'POST',
    body: new URLSearchParams({
      upload_phase: 'finish',
      video_id,
      video_state: 'PUBLISHED',
      title: input.title.slice(0, 250),
      description: input.caption.slice(0, 5000),
      access_token: token,
    }),
  })

  const info = await call<{ permalink_url?: string }>(graph(`${video_id}?fields=permalink_url&access_token=${token}`)).catch(
    () => ({}) as { permalink_url?: string },
  )
  const link = info.permalink_url
  return { postId: video_id, permalink: link ? (link.startsWith('http') ? link : `https://www.facebook.com${link}`) : null }
}
