import { redirectUri, SocialError, type ConnectedAccount, type PublishInput, type PublishResult } from './types'

// youtube.upload to post Shorts; youtube.readonly to read the channel name/avatar.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
const clientId = () => process.env.GOOGLE_CLIENT_ID!.trim()
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET!.trim()

export function googleAuthUrl(state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri('google'),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // gives a refresh token so we can post while the user is away
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString()
  return url.toString()
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
  })
  const json = (await res.json()) as TokenResponse
  if (!res.ok) throw new SocialError(`Google: ${json.error_description ?? json.error ?? res.statusText}`, json.error === 'invalid_grant')
  return json
}

export async function googleExchange(code: string): Promise<ConnectedAccount[]> {
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri('google') })
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const json = await res.json()
  if (!res.ok) throw new SocialError(`YouTube: ${json.error?.message ?? res.statusText}`)
  if (!json.items?.length) throw new SocialError('That Google account has no YouTube channel yet — create one, then connect again.')

  return json.items.map((ch: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> } }) => ({
    platform: 'youtube' as const,
    externalId: ch.id,
    displayName: ch.snippet.title,
    handle: ch.snippet.customUrl ?? null,
    avatarUrl: (ch.snippet.thumbnails?.medium ?? ch.snippet.thumbnails?.default)?.url ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }))
}

export async function googleRefresh(refreshToken: string) {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
  return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() }
}

/** Resumable upload. Vertical videos under 3 minutes are treated as Shorts automatically. */
export async function publishYouTube(input: PublishInput): Promise<PublishResult> {
  const video = await fetch(input.videoUrl)
  if (!video.ok) throw new SocialError(`Couldn't read the clip file (${video.status})`)
  const bytes = await video.arrayBuffer()

  const description = input.caption.includes('#Shorts') ? input.caption : `${input.caption}\n\n#Shorts`.trim()
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(bytes.byteLength),
    },
    body: JSON.stringify({
      snippet: { title: input.title.slice(0, 100) || 'New clip', description: description.slice(0, 5000), categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    }),
  })
  if (!start.ok) {
    const json = await start.json().catch(() => ({}))
    throw new SocialError(`YouTube: ${json.error?.message ?? start.statusText}`, start.status === 401)
  }
  const uploadUrl = start.headers.get('location')
  if (!uploadUrl) throw new SocialError('YouTube did not return an upload URL')

  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes })
  const json = await put.json()
  if (!put.ok) throw new SocialError(`YouTube upload: ${json.error?.message ?? put.statusText}`)
  return { postId: json.id, permalink: `https://youtube.com/shorts/${json.id}` }
}
