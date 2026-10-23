import { PlatformError, type ResolvedChannel, type StreamSnapshot } from './types.js'

const API = 'https://www.googleapis.com/youtube/v3'

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY?.trim()
  if (!key) throw new PlatformError('YouTube isn’t connected yet (YOUTUBE_API_KEY missing)')
  return key
}

export const youtubeEnabled = () => Boolean(process.env.YOUTUBE_API_KEY?.trim())

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('key', apiKey())
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new PlatformError(`YouTube: ${json.error?.message ?? res.statusText}`)
  return json as T
}

type Lookup =
  | { by: 'handle'; value: string }
  | { by: 'id'; value: string }
  | { by: 'username'; value: string }
  | { by: 'video'; value: string }
  | { by: 'search'; value: string }

export function parseYouTube(input: string): Lookup | null {
  const raw = input.trim()
  if (/^@[\w.-]{3,}$/.test(raw)) return { by: 'handle', value: raw }
  if (/^UC[\w-]{22}$/.test(raw)) return { by: 'id', value: raw }

  let url: URL
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtu.be') return { by: 'video', value: url.pathname.slice(1) }
  if (host !== 'youtube.com') return null

  const [first, second] = url.pathname.split('/').filter(Boolean)
  if (first?.startsWith('@')) return { by: 'handle', value: decodeURIComponent(first) }
  if (first === 'channel' && second) return { by: 'id', value: second }
  if (first === 'user' && second) return { by: 'username', value: second }
  if (first === 'c' && second) return { by: 'search', value: second }
  if (first === 'watch' && url.searchParams.get('v')) return { by: 'video', value: url.searchParams.get('v')! }
  if ((first === 'live' || first === 'shorts') && second) return { by: 'video', value: second }
  return null
}

type ChannelItem = {
  id: string
  snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> }
}

export async function resolveYouTube(input: string): Promise<ResolvedChannel> {
  const lookup = parseYouTube(input)
  if (!lookup) throw new PlatformError('That doesn’t look like a YouTube channel or video link')

  let params: Record<string, string>
  if (lookup.by === 'handle') params = { forHandle: lookup.value }
  else if (lookup.by === 'id') params = { id: lookup.value }
  else if (lookup.by === 'username') params = { forUsername: lookup.value }
  else if (lookup.by === 'video') {
    const v = await yt<{ items: { snippet: { channelId: string } }[] }>('videos', { part: 'snippet', id: lookup.value })
    if (!v.items.length) throw new PlatformError('Couldn’t find that YouTube video')
    params = { id: v.items[0].snippet.channelId }
  } else {
    // Legacy /c/ URLs have no direct lookup; search costs 100 quota units, so it's the last resort.
    const s = await yt<{ items: { snippet: { channelId: string } }[] }>('search', {
      part: 'snippet',
      type: 'channel',
      maxResults: '1',
      q: lookup.value,
    })
    if (!s.items.length) throw new PlatformError('Couldn’t find that YouTube channel')
    params = { id: s.items[0].snippet.channelId }
  }

  const res = await yt<{ items?: ChannelItem[] }>('channels', { part: 'snippet', ...params })
  const ch = res.items?.[0]
  if (!ch) throw new PlatformError('Couldn’t find that YouTube channel')
  const thumbs = ch.snippet.thumbnails ?? {}
  return {
    platform: 'youtube',
    channelId: ch.id,
    handle: ch.snippet.customUrl ?? null,
    displayName: ch.snippet.title,
    avatarUrl: (thumbs.medium ?? thumbs.default)?.url ?? null,
    channelUrl: ch.snippet.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
  }
}

// The public uploads feed is free (no API quota) and includes live broadcasts.
async function recentVideoIds(channelId: string, limit: number): Promise<string[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`)
  if (!res.ok) throw new PlatformError(`YouTube feed ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map((m) => m[1]).slice(0, limit)
}

type VideoItem = {
  id: string
  snippet: {
    channelId: string
    title: string
    publishedAt: string
    liveBroadcastContent: 'live' | 'upcoming' | 'none'
    thumbnails?: Record<string, { url: string }>
  }
  contentDetails?: { duration?: string }
  liveStreamingDetails?: {
    actualStartTime?: string
    actualEndTime?: string
    scheduledStartTime?: string
    concurrentViewers?: string
  }
}

function isoDurationToSeconds(iso: string | undefined): number | null {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0))
  const total = d * 86400 + h * 3600 + min * 60 + s
  return total || null
}

function toSnapshot(v: VideoItem): StreamSnapshot {
  const live = v.liveStreamingDetails
  const lbc = v.snippet.liveBroadcastContent
  const thumbs = v.snippet.thumbnails ?? {}
  return {
    externalId: v.id,
    kind: live ? (lbc === 'none' ? 'vod' : 'live') : 'upload',
    status: lbc === 'live' ? 'live' : lbc === 'upcoming' ? 'upcoming' : live ? 'ended' : 'available',
    title: v.snippet.title,
    thumbnailUrl: (thumbs.high ?? thumbs.medium ?? thumbs.default)?.url ?? null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    viewerCount: live?.concurrentViewers ? Number(live.concurrentViewers) : null,
    durationSeconds: isoDurationToSeconds(v.contentDetails?.duration),
    startedAt: live?.actualStartTime ?? live?.scheduledStartTime ?? null,
    endedAt: live?.actualEndTime ?? null,
    publishedAt: v.snippet.publishedAt,
  }
}

/** The channel's /live page points at its current (or next scheduled) broadcast, if any. No quota cost. */
async function currentLiveId(channelId: string): Promise<string | null> {
  const res = await fetch(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`, {
    headers: { 'Accept-Language': 'en', Cookie: 'CONSENT=YES+1' },
  }).catch(() => null)
  if (!res?.ok) return null
  const html = await res.text()
  const canonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)
  return canonical?.[1] ?? null
}

/**
 * Latest videos per channel with live status. Costs 1 quota unit per 50 videos
 * (videos.list), regardless of how many channels they come from.
 */
export async function fetchYouTube(channelIds: string[], perChannel = 8): Promise<Map<string, StreamSnapshot[]>> {
  const result = new Map<string, StreamSnapshot[]>(channelIds.map((id) => [id, []]))
  const idLists = await Promise.all(
    channelIds.map(async (id) => {
      const [recent, live] = await Promise.all([recentVideoIds(id, perChannel).catch(() => [] as string[]), currentLiveId(id)])
      return live ? [live, ...recent] : recent
    }),
  )
  const allIds = [...new Set(idLists.flat())]

  for (let i = 0; i < allIds.length; i += 50) {
    const batch = allIds.slice(i, i + 50)
    const res = await yt<{ items: VideoItem[] }>('videos', {
      part: 'snippet,contentDetails,liveStreamingDetails',
      id: batch.join(','),
      maxResults: '50',
    })
    for (const v of res.items) result.get(v.snippet.channelId)?.push(toSnapshot(v))
  }
  return result
}
