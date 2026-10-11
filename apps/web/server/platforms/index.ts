import { fetchTwitch, parseTwitch, resolveTwitch, twitchEnabled } from './twitch'
import { PlatformError, type Platform, type ResolvedChannel, type StreamSnapshot } from './types'
import { fetchYouTube, parseYouTube, resolveYouTube, youtubeEnabled } from './youtube'

export * from './types'

export function detectPlatform(input: string): Platform | null {
  const s = input.trim().toLowerCase()
  if (s.includes('twitch.tv')) return 'twitch'
  if (s.includes('kick.com')) return 'kick'
  if (s.includes('youtube.com') || s.includes('youtu.be') || parseYouTube(input)) return 'youtube'
  if (parseTwitch(input)) return 'twitch' // bare login like "shroud"
  return null
}

export function enabledPlatforms(): Platform[] {
  return [youtubeEnabled() && 'youtube', twitchEnabled() && 'twitch'].filter(Boolean) as Platform[]
}

export async function resolveChannel(input: string): Promise<ResolvedChannel> {
  const platform = detectPlatform(input)
  if (platform === 'youtube') return resolveYouTube(input)
  if (platform === 'twitch') return resolveTwitch(input)
  if (platform === 'kick') throw new PlatformError('Kick support is coming soon')
  throw new PlatformError('Paste a YouTube or Twitch channel link')
}

export async function fetchRecent(platform: Platform, channelIds: string[]): Promise<Map<string, StreamSnapshot[]>> {
  if (platform === 'youtube') return fetchYouTube(channelIds)
  if (platform === 'twitch') return fetchTwitch(channelIds)
  return new Map()
}
