import { BillingError } from './billing'
import { getEntitlements } from './entitlements'
import { enabledPlatforms, fetchRecent, resolveChannel, type Platform, type StreamSnapshot } from './platforms'
import { supabaseAdmin } from './supabase'

export type CreatorRow = {
  id: string
  workspace_id: string
  platform: Platform
  channel_id: string
  display_name: string
}

export async function addCreator(workspaceId: string, input: string) {
  const db = supabaseAdmin()
  const ent = await getEntitlements(workspaceId)
  if (ent.planId === 'free') throw new BillingError('You need an active plan or Day Pass to watch creators', 403)

  const { count } = await db
    .from('creators')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('active', true)
  if ((count ?? 0) >= ent.limits.creators) {
    throw new BillingError(`Your plan watches up to ${ent.limits.creators} creators. Remove one or upgrade.`, 403)
  }

  const channel = await resolveChannel(input)
  if (!enabledPlatforms().includes(channel.platform)) {
    throw new BillingError(`${channel.platform} isn’t connected on this server yet`, 503)
  }

  const { data, error } = await db
    .from('creators')
    .upsert(
      {
        workspace_id: workspaceId,
        platform: channel.platform,
        channel_id: channel.channelId,
        handle: channel.handle,
        display_name: channel.displayName,
        avatar_url: channel.avatarUrl,
        channel_url: channel.channelUrl,
        active: true,
      },
      { onConflict: 'workspace_id,platform,channel_id' },
    )
    .select('id, workspace_id, platform, channel_id, display_name')
    .single()
  if (error) throw error

  // Pull their latest videos/live status right away so the page isn't empty.
  await refreshCreators([data as CreatorRow])
  return data
}

export async function removeCreator(workspaceId: string, creatorId: string) {
  const { error } = await supabaseAdmin().from('creators').delete().eq('id', creatorId).eq('workspace_id', workspaceId)
  if (error) throw error
}

/** Check a set of creators (any mix of platforms/workspaces) and store what we find. */
export async function refreshCreators(creators: CreatorRow[]) {
  const db = supabaseAdmin()
  const byPlatform = new Map<Platform, CreatorRow[]>()
  for (const c of creators) byPlatform.set(c.platform, [...(byPlatform.get(c.platform) ?? []), c])

  for (const [platform, group] of byPlatform) {
    const checkedAt = new Date().toISOString()
    let snapshots: Map<string, StreamSnapshot[]>
    try {
      snapshots = await fetchRecent(platform, [...new Set(group.map((c) => c.channel_id))])
    } catch (e) {
      const message = (e as Error).message
      console.error(`[monitor] ${platform}:`, message)
      await db.from('creators').update({ last_checked_at: checkedAt, last_error: message }).in('id', group.map((c) => c.id))
      continue
    }

    for (const creator of group) {
      const items = snapshots.get(creator.channel_id) ?? []
      if (items.length) {
        const { error } = await db.from('streams').upsert(
          items.map((s) => ({
            creator_id: creator.id,
            workspace_id: creator.workspace_id,
            platform,
            external_id: s.externalId,
            kind: s.kind,
            status: s.status,
            title: s.title,
            thumbnail_url: s.thumbnailUrl,
            url: s.url,
            viewer_count: s.viewerCount,
            duration_seconds: s.durationSeconds,
            started_at: s.startedAt,
            ended_at: s.endedAt,
            published_at: s.publishedAt,
            updated_at: checkedAt,
          })),
          { onConflict: 'creator_id,external_id' },
        )
        if (error) console.error('[monitor] save streams', creator.display_name, error.message)
      }

      // Twitch live entries disappear when the stream stops — mark any we didn't see this round as ended.
      const liveIds = items.filter((s) => s.status === 'live').map((s) => s.externalId)
      let ended = db
        .from('streams')
        .update({ status: 'ended', ended_at: checkedAt, updated_at: checkedAt })
        .eq('creator_id', creator.id)
        .eq('status', 'live')
      if (liveIds.length) ended = ended.not('external_id', 'in', `(${liveIds.map((id) => `"${id}"`).join(',')})`)
      await ended

      await db
        .from('creators')
        .update({ is_live: liveIds.length > 0, last_checked_at: checkedAt, last_error: null })
        .eq('id', creator.id)
    }
  }
}
