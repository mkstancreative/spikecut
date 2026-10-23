import { run } from '../worker/exec.js'
import { tools, ytdlpAuthArgs } from '../worker/config.js'
import { PlatformError, type ResolvedChannel, type StreamSnapshot } from './types.js'

// TikTok has no public API for other people's videos, so profiles are read with yt-dlp (needs the binary on this host).

export function parseTikTok(input: string): string | null {
  const raw = input.trim()
  if (/^@[\w.]{2,24}$/.test(raw)) return raw.slice(1).toLowerCase()
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    if (!/(^|\.)tiktok\.com$/.test(url.hostname)) return null
    const user = url.pathname.split('/').find((p) => p.startsWith('@'))
    return user && /^@[\w.]{2,24}$/.test(user) ? user.slice(1).toLowerCase() : null
  } catch {
    return null
  }
}

type Entry = {
  id: string
  title?: string
  duration?: number
  timestamp?: number
  channel?: string
  uploader?: string
  thumbnails?: { url: string }[]
}
type Profile = { id: string; entries?: Entry[] }

async function list(target: string, limit: number): Promise<Profile> {
  const out = await run(tools.ytdlp, [...ytdlpAuthArgs(), '--flat-playlist', '--playlist-end', String(limit), '-J', '--no-warnings', target], {
    signal: AbortSignal.timeout(90_000),
  }).catch((e: Error) => {
    if (/ENOENT/.test(e.message)) throw new PlatformError('TikTok watching needs yt-dlp on the server')
    throw new PlatformError(`TikTok: ${e.message.split('ERROR: ').at(-1)?.slice(0, 200) ?? 'lookup failed'}`)
  })
  return JSON.parse(out) as Profile
}

/**
 * Looking a profile up by @username fails now and then (TikTok leaves the user ID out of the page),
 * so it's retried here once, and from then on the creator is checked by that stable ID.
 */
export async function resolveTikTok(input: string): Promise<ResolvedChannel> {
  const username = parseTikTok(input)
  if (!username) throw new PlatformError('That doesn’t look like a TikTok profile link — e.g. tiktok.com/@creator')
  let profile: Profile | undefined
  for (let attempt = 0; !profile; attempt++) {
    profile = await list(`https://www.tiktok.com/@${username}`, 1).catch(async (e) => {
      if (attempt >= 3) throw new PlatformError(`TikTok: couldn’t look up @${username} — check the link and that the profile is public`, { cause: e })
      await new Promise((r) => setTimeout(r, 1500))
      return undefined
    })
  }
  return {
    platform: 'tiktok',
    channelId: profile.id,
    handle: `@${username}`,
    displayName: profile.entries?.[0]?.channel || `@${username}`,
    avatarUrl: null,
    channelUrl: `https://www.tiktok.com/@${username}`,
  }
}

/** Latest videos for each creator, keyed by TikTok's stable user ID. */
export async function fetchTikTok(userIds: string[], perChannel = 12): Promise<Map<string, StreamSnapshot[]>> {
  const result = new Map<string, StreamSnapshot[]>()
  const errors: Error[] = []
  // A few profiles at a time — each one is a yt-dlp process.
  for (let i = 0; i < userIds.length; i += 3) {
    await Promise.all(
      userIds.slice(i, i + 3).map(async (id) => {
        const profile = await list(`tiktokuser:${id}`, perChannel).catch((e: Error) => {
          console.error('[monitor] tiktok', id, e.message)
          errors.push(e)
        })
        if (!profile) return
        const { entries = [] } = profile
        result.set(
          id,
          entries.map((e) => ({
            externalId: e.id,
            kind: 'upload',
            status: 'available',
            title: e.title || null,
            thumbnailUrl: e.thumbnails?.at(-1)?.url ?? null,
            url: `https://www.tiktok.com/@${e.uploader || '_'}/video/${e.id}`,
            viewerCount: null,
            durationSeconds: e.duration ? Math.round(e.duration) : null,
            startedAt: null,
            endedAt: null,
            publishedAt: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null,
          })),
        )
      }),
    )
  }
  // One bad profile shouldn't flag every TikTok creator; only give up when none could be read.
  if (errors.length && errors.length === userIds.length) throw errors[0]
  return result
}
