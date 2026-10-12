export type SocialPlatform = 'youtube' | 'instagram' | 'facebook'

export type ConnectedAccount = {
  platform: SocialPlatform
  externalId: string
  displayName: string
  handle: string | null
  avatarUrl: string | null
  accessToken: string
  refreshToken?: string | null
  tokenExpiresAt?: string | null
  meta?: Record<string, unknown>
}

export type PublishInput = {
  accessToken: string
  account: { external_id: string; meta: Record<string, unknown> }
  videoUrl: string // short-lived signed URL the platform downloads from
  videoFile?: string // local path when uploading bytes directly
  title: string
  caption: string
}

export type PublishResult = { postId: string; permalink: string | null }

export class SocialError extends Error {
  constructor(
    message: string,
    readonly needsReconnect = false,
  ) {
    super(message)
  }
}

export const redirectUri = (provider: 'google' | 'meta') =>
  `${(process.env.APP_URL?.trim() || 'https://localhost:5180').replace(/\/$/, '')}/api/oauth/${provider}/callback`
