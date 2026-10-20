export type Platform = 'youtube' | 'twitch' | 'kick' | 'tiktok' | 'instagram'

export type ResolvedChannel = {
  platform: Platform
  channelId: string
  handle: string | null
  displayName: string
  avatarUrl: string | null
  channelUrl: string
}

export type StreamSnapshot = {
  externalId: string
  kind: 'live' | 'vod' | 'upload'
  status: 'live' | 'upcoming' | 'ended' | 'available'
  title: string | null
  thumbnailUrl: string | null
  url: string
  viewerCount: number | null
  durationSeconds: number | null
  startedAt: string | null
  endedAt: string | null
  publishedAt: string | null
}

export class PlatformError extends Error {}
