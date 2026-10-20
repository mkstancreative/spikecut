import { metaEnabled } from '../social/meta'
import { fetchInstagram, parseInstagram, resolveInstagram } from './instagram'
import { fetchTikTok, parseTikTok, resolveTikTok } from './tiktok'
import { fetchTwitch, parseTwitch, resolveTwitch, twitchEnabled } from './twitch'
import { PlatformError, type Platform, type ResolvedChannel, type StreamSnapshot } from './types'
import { fetchYouTube, parseYouTube, resolveYouTube, youtubeEnabled } from './youtube'

export * from './types'

export function detectPlatform(input: string): Platform | null {
  const s = input.trim().toLowerCase()
  if (s.includes('twitch.tv')) return 'twitch'
  if (s.includes('kick.com')) return 'kick'
  if (s.includes('tiktok.com') || parseTikTok(input)) return 'tiktok' // also a bare "@handle"
  if (s.includes('instagram.com')) return 'instagram'
  if (s.includes('youtube.com') || s.includes('youtu.be') || parseYouTube(input)) return 'youtube'
  if (parseTwitch(input)) return 'twitch' // bare login like "shroud"
  return null
}

export function enabledPlatforms(): Platform[] {
  return [youtubeEnabled() && 'youtube', twitchEnabled() && 'twitch', 'tiktok', metaEnabled() && 'instagram'].filter(Boolean) as Platform[]
}

/** Instagram lookups go through the workspace's own connected account, so they're per workspace. */
export const perWorkspace = (platform: Platform) => platform === 'instagram'

export async function resolveChannel(input: string, workspaceId?: string): Promise<ResolvedChannel> {
  const platform = detectPlatform(input)
  if (platform === 'youtube') return resolveYouTube(input)
  if (platform === 'twitch') return resolveTwitch(input)
  if (platform === 'tiktok') return resolveTikTok(input)
  if (platform === 'instagram') {
    if (!workspaceId) throw new PlatformError('Instagram lookups need a workspace')
    if (!parseInstagram(input)) throw new PlatformError('Paste an Instagram profile link, not a post — e.g. instagram.com/creator')
    return resolveInstagram(input, workspaceId)
  }
  if (platform === 'kick') throw new PlatformError('Kick support is coming soon')
  throw new PlatformError('Paste a YouTube, Twitch, TikTok or Instagram profile link')
}

export async function fetchRecent(platform: Platform, channelIds: string[], workspaceId?: string): Promise<Map<string, StreamSnapshot[]>> {
  if (platform === 'youtube') return fetchYouTube(channelIds)
  if (platform === 'twitch') return fetchTwitch(channelIds)
  if (platform === 'tiktok') return fetchTikTok(channelIds)
  if (platform === 'instagram' && workspaceId) return fetchInstagram(channelIds, workspaceId)
  return new Map()
}
