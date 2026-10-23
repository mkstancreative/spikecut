import { pickWithClaude } from './ai.js'
import type { AudioEvent, Transcript, Word } from './media.js'

/**
 * Moment detection.
 *
 * With ANTHROPIC_API_KEY set, Claude reads the whole transcript and picks the clips (it understands
 * stories, punchlines and arguments, which no keyword list does); the audio signals below are blended
 * into its score. Without a key — or if the call fails — the heuristic picks on its own:
 *  - loudness: how far a window's loudest moments sit above the video's typical level
 *  - peaks:    the single biggest audio spike (shouts, reactions)
 *  - reactions: laughter / applause / cheering whisper tagged in or just after the window
 *  - hooks:    attention-grabbing phrases, weighted extra in the opening seconds
 *  - pace:     speaking rate relative to the video's norm (excitement speeds people up)
 *  - silence:  dead air is penalised, as are clips that open mid-thought or end on an open question
 * Candidate windows start and end on sentence boundaries so clips never cut mid-thought.
 */

export type DetectedMoment = {
  start: number
  end: number
  score: number
  title: string
  transcript: string
  signals: {
    loudness: number
    peak: number
    hooks: string[]
    pace: number
    silence: number
    reactions: number
    ai?: { score: number; why: string }
    words: [number, number, string][] // absolute times in the source video
  }
}

export const MIN_LEN = 15
export const MAX_LEN = 58
const IDEAL_MIN = 25
const IDEAL_MAX = 45
const WINDOW_SEC = 0.5
const MIN_GAP = 4

// Kept deliberately specific: everyday words ("actually", "why", "don't") fire in every sentence and drown the signal.
const HOOKS = [
  'no way', 'oh my god', 'wait what', 'crazy', 'insane', 'unbelievable', 'secret', 'nobody tells you',
  'biggest', 'worst', 'mistake', 'the truth', 'here’s why', "here's why", 'the problem', 'the reason',
  'you need to', 'how to', 'hack', 'trick', 'finally', 'wow', 'holy', "let's go", "i can't believe",
  'listen', 'game changer', 'warning', 'shocked', 'surprised', 'hidden', 'never again', 'plot twist',
  'red flag', 'the moment', 'true story', 'i swear', 'for real', 'are you serious', 'what happened',
]
const DANGLING = /^(and|but|so|because|or|which|then|also|plus)\b/i

export type Sentence = { start: number; end: number; words: Word[]; text: string; hooks: string[] }

const normalise = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').trim()

function findHooks(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^\w’' ]+/g, ' ')} `
  return HOOKS.filter((h) => t.includes(` ${h} `))
}

function sentences(words: Word[]): Sentence[] {
  const out: Sentence[] = []
  let cur: Word[] = []
  const flush = () => {
    if (!cur.length) return
    const text = cur.map((w) => w.text).join(' ')
    // Whisper hallucination guard: a multi-word sentence repeating one of the last few is a decoding loop.
    const key = normalise(text)
    const repeat = cur.length >= 4 && out.slice(-3).some((s) => normalise(s.text) === key)
    if (!repeat) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur, text, hooks: findHooks(text) })
    cur = []
  }
  words.forEach((w, i) => {
    const gap = i > 0 ? w.start - words[i - 1].end : 0
    if (gap > 0.9) flush()
    cur.push(w)
    if (/[.?!]["”']?$/.test(w.text) || cur.length >= 40) flush()
  })
  flush()
  return out
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
function std(xs: number[]) {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1
}
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** Everything per-video that candidate scoring needs, computed once. */
export type VideoIndex = {
  sents: Sentence[]
  duration: number
  z: number[] // loudness per WINDOW_SEC, normalised to the video
  silentPrefix: number[] // running count of near-silent windows
  wordPrefix: number[] // running word count by sentence
  globalPace: number
  events: AudioEvent[]
}

export function buildIndex({ words, events }: Transcript, db: number[], duration: number): VideoIndex {
  // Normalise loudness against audible windows only (ignore silence when computing the baseline).
  const audible = db.filter((d) => d > -50)
  const baseline = median(audible)
  const spread = std(audible)
  const z = db.map((d) => (d - baseline) / spread)
  const silentPrefix = [0]
  for (const v of z) silentPrefix.push(silentPrefix[silentPrefix.length - 1] + (v < -1.5 ? 1 : 0))
  const sents = sentences(words)
  const wordPrefix = [0]
  for (const s of sents) wordPrefix.push(wordPrefix[wordPrefix.length - 1] + s.words.length)
  const spoken = words.length ? Math.max(1, words[words.length - 1].end - words[0].start) : 1
  return { sents, duration, z, silentPrefix, wordPrefix, globalPace: words.length / spoken, events }
}

/** Clip bounds for sentences i..j (a little air before the first word and after the last). */
export function bounds(ix: VideoIndex, i: number, j: number) {
  return { start: Math.max(0, ix.sents[i].start - 0.25), end: Math.min(ix.duration, ix.sents[j].end + 0.4) }
}

/** Heuristic signals + raw score for the clip spanning sentences i..j. */
function measure(ix: VideoIndex, i: number, j: number) {
  const { start, end } = bounds(ix, i, j)
  const len = end - start
  const a = Math.floor(start / WINDOW_SEC)
  const b = Math.min(ix.z.length, Math.ceil(end / WINDOW_SEC))
  const zs = ix.z.slice(a, b)
  const top = zs.length ? [...zs].sort((x, y) => y - x).slice(0, Math.max(1, Math.round(zs.length * 0.2))) : [0]
  const loud = mean(top)
  const peak = zs.length ? Math.max(...zs) : 0
  const silence = (ix.silentPrefix[b] - ix.silentPrefix[a]) / Math.max(1, b - a)

  const hooks = new Set<string>()
  const openingHooks = new Set<string>()
  for (let k = i; k <= j; k++) {
    for (const h of ix.sents[k].hooks) {
      hooks.add(h)
      if (ix.sents[k].start < start + 6) openingHooks.add(h)
    }
  }
  const pace = (ix.wordPrefix[j + 1] - ix.wordPrefix[i]) / len / ix.globalPace
  // A laugh or applause just after the last line is the payoff landing — count it.
  const reactions = ix.events.filter((e) => e.at >= start && e.at <= end + 1.5).length

  const lengthFit = len >= IDEAL_MIN && len <= IDEAL_MAX ? 0.4 : 0
  const opensWithQuestion = /\?/.test(ix.sents[i].text) ? 0.5 : 0
  const dangling = DANGLING.test(ix.sents[i].text) ? 0.6 : 0
  const endsOpen = j > i && /\?["”']?$/.test(ix.sents[j].text) ? 0.4 : 0
  const raw =
    1.0 * loud +
    0.35 * Math.min(peak, 4) +
    0.7 * Math.min(openingHooks.size, 2) +
    0.2 * Math.min(hooks.size, 4) +
    0.6 * Math.min(reactions, 3) +
    0.8 * Math.max(-1, Math.min(1, pace - 1)) +
    opensWithQuestion +
    lengthFit -
    dangling -
    endsOpen -
    2.0 * silence

  return { start, end, len, raw, loud, peak, silence, pace, reactions, hooks: [...hooks] }
}

type Candidate = { i: number; j: number; raw: number }

function toMoment(ix: VideoIndex, c: Candidate, score: number, title?: string, ai?: { score: number; why: string }): DetectedMoment {
  const m = measure(ix, c.i, c.j)
  const ws = ix.sents.slice(c.i, c.j + 1).flatMap((s) => s.words)
  const first = ix.sents[c.i].text
  return {
    start: m.start,
    end: m.end,
    score,
    title: title || (first.length > 90 ? `${first.slice(0, 87)}…` : first),
    transcript: ws.map((w) => w.text).join(' '),
    signals: {
      loudness: +m.loud.toFixed(2),
      peak: +m.peak.toFixed(2),
      hooks: m.hooks,
      pace: +m.pace.toFixed(2),
      silence: +m.silence.toFixed(2),
      reactions: m.reactions,
      ...(ai ? { ai } : {}),
      words: ws.map((w) => [+w.start.toFixed(2), +w.end.toFixed(2), w.text]),
    },
  }
}

/** Every sentence-aligned window of a usable length, with its heuristic score. */
function candidates(ix: VideoIndex): Candidate[] {
  const out: Candidate[] = []
  for (let i = 0; i < ix.sents.length; i++) {
    for (let j = i; j < ix.sents.length; j++) {
      const { start, end } = bounds(ix, i, j)
      if (end - start < MIN_LEN) continue
      if (end - start > MAX_LEN) break
      out.push({ i, j, raw: measure(ix, i, j).raw })
    }
  }
  return out
}

const overlaps = (ix: VideoIndex, c: Candidate, picked: Candidate[]) => {
  const a = bounds(ix, c.i, c.j)
  return picked.some((p) => {
    const b = bounds(ix, p.i, p.j)
    return !(a.end + MIN_GAP <= b.start || a.start >= b.end + MIN_GAP)
  })
}

const clamp = (n: number) => Math.round(Math.min(99, Math.max(1, n)))
const absoluteScore = (raw: number) => clamp(100 * (1 - Math.exp(-Math.max(0, raw) / 2.2))) // raw 2 → 60, 3 → 74, 4 → 84

/** A longer video can carry more clips: ~1 per 5 minutes, between 5 and 20. */
export const defaultMaxMoments = (duration: number) => Math.min(20, Math.max(5, Math.round(duration / 300)))

/**
 * `relative` (default, for whole videos): heuristic scores are spread 1–99 across this video's candidates.
 * `absolute` (for live windows): a fixed curve, so a score of 80 means the same thing in every window —
 * needed for auto-clip thresholds. Claude's scores are already absolute.
 */
export async function findMoments(
  transcript: Transcript,
  db: number[],
  duration: number,
  opts: { scale?: 'relative' | 'absolute'; maxMoments?: number; title?: string; focusFrom?: number; signal?: AbortSignal } = {},
): Promise<DetectedMoment[]> {
  if (transcript.words.length < 20 || duration < MIN_LEN + 5) return []
  const ix = buildIndex(transcript, db, duration)
  const pool = candidates(ix)
  if (!pool.length) return []
  const max = opts.maxMoments ?? defaultMaxMoments(duration)

  // Heuristic score for any candidate, on the requested scale.
  const raws = pool.map((c) => c.raw)
  const lo = median(raws)
  const hi = Math.max(...raws)
  const heuristicScore = (raw: number) =>
    opts.scale === 'absolute' ? absoluteScore(raw) : clamp(50 + (49 * (raw - lo)) / Math.max(0.001, hi - lo))

  const picks = await pickWithClaude(ix, { max, title: opts.title, focusFrom: opts.focusFrom, signal: opts.signal }).catch((e) => {
    if (opts.signal?.aborted) throw e
    console.error('[scoring] Claude pick failed, using heuristic:', (e as Error).message)
    return null
  })
  if (picks) {
    const chosen: Candidate[] = []
    const out: DetectedMoment[] = []
    for (const p of picks) {
      const c = { i: p.first, j: p.last, raw: measure(ix, p.first, p.last).raw }
      if (chosen.length >= max || overlaps(ix, c, chosen)) continue
      chosen.push(c)
      // Claude judges the content; audio energy nudges ties (a laugh-out-loud room beats a flat read).
      out.push(toMoment(ix, c, clamp(0.85 * p.score + 0.15 * heuristicScore(c.raw)), p.title, { score: p.score, why: p.why }))
    }
    return out.sort((a, b) => b.score - a.score)
  }

  // Greedy pick of the best non-overlapping windows.
  pool.sort((a, b) => b.raw - a.raw)
  const picked: Candidate[] = []
  for (const c of pool) {
    if (picked.length >= max) break
    if (!overlaps(ix, c, picked)) picked.push(c)
  }
  return picked.map((c) => toMoment(ix, c, heuristicScore(c.raw)))
}
