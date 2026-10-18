import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { bounds, MAX_LEN, MIN_LEN, type VideoIndex } from './scoring'

/**
 * Claude as the clip editor: it reads the sentence-numbered transcript (with laughter/loudness marks)
 * and returns the sentence ranges worth clipping. Optional — without ANTHROPIC_API_KEY scoring falls back
 * to the audio/keyword heuristic.
 */

const MODEL = process.env.CLIP_AI_MODEL?.trim() || 'claude-opus-5-5'

let client: Anthropic | null = null
const getClient = () => (client ??= new Anthropic({ timeout: 5 * 60 * 1000 }))
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.CLIP_AI !== 'off'

const Picks = z.object({
  clips: z.array(
    z.object({
      first: z.number().int().describe('Index of the first sentence in the clip'),
      last: z.number().int().describe('Index of the last sentence in the clip (inclusive)'),
      title: z.string().describe('Punchy caption for the clip, under 70 characters'),
      score: z.number().int().describe('1–100 calibrated clip quality'),
      why: z.string().describe('One short sentence: what makes this clip work'),
    }),
  ),
})
export type AiPick = z.infer<typeof Picks>['clips'][number]

// Built on use: scoring.ts imports this module, so its constants aren't initialised at load time.
const systemPrompt = () => `You are a senior short-form video editor. From the transcript of a longer video, you pick the moments that will perform best as standalone vertical clips on TikTok, Instagram Reels and YouTube Shorts.

What makes a strong clip:
- The opening line grabs attention on its own — a viewer scrolling past with zero context is hooked in the first 3 seconds.
- It is self-contained: no earlier context needed to follow it. Don't start mid-thought (e.g. on "and", "so", "but that's why") or on a reply to a question the clip doesn't include.
- It has a payoff: a punchline, a reveal, a hot take, a heated disagreement, a strong emotional beat, a surprising fact, a genuinely useful insight, or a big reaction.
- It ends right after the payoff lands (include the laugh or reaction), not before it and not trailing into the next topic.

Skip intros, outros, sponsor reads, housekeeping, small talk and rambling. Transcripts come from speech recognition, so read past small mistranscriptions.

Transcript format: one sentence per line as "[index] start_seconds +duration_seconds FLAGS: text". FLAGS may include LAUGH (laughter/applause/cheering detected) and LOUD (noticeably louder than usual — shouting, excitement). A clip runs from the start of its first sentence to the end of its last; it must be ${MIN_LEN}–${MAX_LEN} seconds long, ideally 20–50.

Score each clip 1–100, calibrated across all videos rather than relative to this one: 90+ could go viral, 70–89 is a solid post, 50–69 is filler, under 50 isn't worth posting. Return clips best-first and non-overlapping. Write titles in the language of the video, no hashtags, and don't promise anything the clip doesn't deliver. Return fewer clips — or none — rather than padding with weak ones.`

const fmt = (s: number) => s.toFixed(1)

function transcriptLines(ix: VideoIndex) {
  return ix.sents
    .map((s, i) => {
      const a = Math.floor(s.start / 0.5)
      const b = Math.max(a + 1, Math.ceil(s.end / 0.5))
      const zs = ix.z.slice(a, b)
      const loud = zs.length && zs.reduce((x, y) => x + y, 0) / zs.length > 1.2
      const laugh = ix.events.some((e) => e.at >= s.start - 0.5 && e.at <= s.end + 1.5)
      const flags = [laugh && 'LAUGH', loud && 'LOUD'].filter(Boolean).join(' ')
      return `[${i}] ${fmt(s.start)} +${fmt(s.end - s.start)}${flags ? ` ${flags}` : ''}: ${s.text}`
    })
    .join('\n')
}

/** Nudge a sentence range until the clip length is within limits; null if it can't be. */
function fit(ix: VideoIndex, first: number, last: number): [number, number] | null {
  const n = ix.sents.length
  let i = Math.max(0, Math.min(first, last, n - 1))
  let j = Math.min(n - 1, Math.max(first, last, 0))
  const len = () => bounds(ix, i, j).end - bounds(ix, i, j).start
  while (len() > MAX_LEN && j > i) j--
  while (len() < MIN_LEN && (j < n - 1 || i > 0)) {
    if (j < n - 1) j++
    else i--
  }
  return len() >= MIN_LEN && len() <= MAX_LEN ? [i, j] : null
}

export async function pickWithClaude(
  ix: VideoIndex,
  opts: { max: number; title?: string; focusFrom?: number },
): Promise<AiPick[] | null> {
  if (!aiEnabled() || !ix.sents.length) return null

  const ask = [
    opts.title ? `Video title: ${opts.title}` : null,
    `Length: ${Math.round(ix.duration / 60)} minutes.`,
    opts.focusFrom != null
      ? `This is the latest stretch of a live stream. Only pick clips that end after ${fmt(opts.focusFrom)}s; earlier lines are context.`
      : null,
    `Pick up to ${opts.max} clips.`,
    '',
    '<transcript>',
    transcriptLines(ix),
    '</transcript>',
  ]
    .filter((l) => l != null)
    .join('\n')

  const defaultModel = MODEL === 'claude-opus-5-5'
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(),
    messages: [{ role: 'user', content: ask }],
    output_config: { format: betaZodOutputFormat(Picks) },
    // If a safety classifier declines (e.g. a heated debate misread), retry on a fallback model in the same call.
    ...(defaultModel ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  })
  if (res.stop_reason === 'refusal') throw new Error(`Claude declined (${res.stop_details?.category ?? 'unknown'})`)
  if (res.stop_reason === 'max_tokens') throw new Error('Claude response was cut off')
  const clips = res.parsed_output?.clips
  if (!clips) throw new Error('Claude returned no parseable clips')

  const out: AiPick[] = []
  for (const c of clips) {
    const range = fit(ix, c.first, c.last)
    if (!range) continue
    out.push({ ...c, first: range[0], last: range[1], score: Math.round(Math.min(99, Math.max(1, c.score))) })
  }
  console.log(
    `[scoring] Claude picked ${out.length} clip(s) from ${ix.sents.length} sentences ` +
      `(${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens)`,
  )
  return out
}
