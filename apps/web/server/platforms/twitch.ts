import { PlatformError, type ResolvedChannel, type StreamSnapshot } from './types'

const HELIX = 'https://api.twitch.tv/helix'
let token: { value: string; expiresAt: number } | undefined

export const twitchEnabled = () =>
  Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim())

function creds() {
  if (!twitchEnabled()) throw new PlatformError('Twitch isn’t connected yet (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing)')
  return { id: process.env.TWITCH_CLIENT_ID!.trim(), secret: process.env.TWITCH_CLIENT_SECRET!.trim() }
}

// App access token (client credentials) — enough for public channel/stream data.
async function appToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value
  const { id, secret } = creds()
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  })
  const json = await res.json()
  if (!res.ok) throw new PlatformError(`Twitch auth: ${json.message ?? res.statusText}`)
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return token.value
}

async function helix<T>(path: string, params: [string, string][]): Promise<T> {
  const url = new URL(`${HELIX}/${path}`)
  for (const [k, v] of params) url.searchParams.append(k, v)
  const res = await fetch(url, { headers: { 'Client-Id': creds().id, Authorization: `Bearer ${await appToken()}` } })
  const json = await res.json()
  if (!res.ok) throw new PlatformError(`Twitch: ${json.message ?? res.statusText}`)
  return json as T
}

export function parseTwitch(input: string): string | null {
  const raw = input.trim()
  if (/^[a-zA-Z0-9_]{3,25}$/.test(raw)) return raw.toLowerCase()
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    if (!/(^|\.)twitch\.tv$/.test(url.hostname)) return null
    const login = url.pathname.split('/').filter(Boolean)[0]
    return login && /^[a-zA-Z0-9_]{3,25}$/.test(login) ? login.toLowerCase() : null
  } catch {
    return null
  }
}

type TwitchUser = { id: string; login: string; display_name: string; profile_image_url: string }

export async function resolveTwitch(input: string): Promise<ResolvedChannel> {
  const login = parseTwitch(input)
  if (!login) throw new PlatformError('That doesn’t look like a Twitch channel link')
  const { data } = await helix<{ data: TwitchUser[] }>('users', [['login', login]])
  const u = data[0]
  if (!u) throw new PlatformError(`No Twitch channel called “${login}”`)
  return {
    platform: 'twitch',
    channelId: u.id,
    handle: u.login,
    displayName: u.display_name,
    avatarUrl: u.profile_image_url || null,
    channelUrl: `https://www.twitch.tv/${u.login}`,
  }
}

type TwitchStream = { id: string; user_id: string; user_login: string; title: string; viewer_count: number; started_at: string; thumbnail_url: string }
type TwitchVideo = { id: string; user_id: string; title: string; url: string; created_at: string; published_at: string; duration: string; thumbnail_url: string; stream_id: string | null }

function twitchDuration(d: string): number | null {
  const m = d.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || null
}

/** Live status (one call per 100 channels) plus the latest past broadcasts (one call per channel). */
export async function fetchTwitch(userIds: string[], perChannel = 5): Promise<Map<string, StreamSnapshot[]>> {
  const result = new Map<string, StreamSnapshot[]>(userIds.map((id) => [id, []]))

  for (let i = 0; i < userIds.length; i += 100) {
    const { data } = await helix<{ data: TwitchStream[] }>('streams', userIds.slice(i, i + 100).map((id) => ['user_id', id]))
    for (const s of data) {
      result.get(s.user_id)?.push({
        externalId: `stream:${s.id}`,
        kind: 'live',
        status: 'live',
        title: s.title,
        thumbnailUrl: s.thumbnail_url.replace('{width}', '640').replace('{height}', '360'),
        url: `https://www.twitch.tv/${s.user_login}`,
        viewerCount: s.viewer_count,
        durationSeconds: null,
        startedAt: s.started_at,
        endedAt: null,
        publishedAt: s.started_at,
      })
    }
  }

  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await helix<{ data: TwitchVideo[] }>('videos', [
        ['user_id', id],
        ['type', 'archive'],
        ['first', String(perChannel)],
      ]).catch(() => ({ data: [] as TwitchVideo[] }))
      for (const v of data) {
        result.get(id)?.push({
          externalId: `video:${v.id}`,
          kind: 'vod',
          status: 'available',
          title: v.title,
          thumbnailUrl: v.thumbnail_url ? v.thumbnail_url.replace('%{width}', '640').replace('%{height}', '360') : null,
          url: v.url,
          viewerCount: null,
          durationSeconds: twitchDuration(v.duration),
          startedAt: v.created_at,
          endedAt: null,
          publishedAt: v.published_at,
        })
      }
    }),
  )
  return result
}
