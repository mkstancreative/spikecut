import type { Word } from './media'

/**
 * Moment detection for recorded videos.
 *
 * Signals (live chat velocity joins these once live capture lands):
 *  - loudness: how far a window's loudest moments sit above the video's typical level
 *  - peaks:    the single biggest audio spike (shouts, laughter, reactions)
 *  - hooks:    attention-grabbing phrases, weighted extra in the opening seconds
 *  - pace:     speaking rate relative to the video's norm (excitement speeds people up)
 *  - silence:  dead air is penalised
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
    words: [number, number, string][] // absolute times in the source video
  }
}

const MIN_LEN = 15
const MAX_LEN = 58
const IDEAL_MIN = 25
const IDEAL_MAX = 45
const WINDOW_SEC = 0.5
const MAX_MOMENTS = 8
const MIN_GAP = 4

const HOOKS = [
  'no way', 'oh my god', 'wait what', 'wait', 'crazy', 'insane', 'unbelievable', 'actually', 'secret',
  'nobody', 'never', 'always', 'biggest', 'worst', 'best', 'mistake', 'truth', 'here’s why', "here's why",
  'the problem', 'you need', 'stop', 'how to', 'why', 'money', 'free', 'hack', 'trick', 'finally', 'huge',
  'wow', 'holy', "let's go", 'bro', 'dude', 'honestly', "i can't believe", 'listen', 'the reason',
  'game changer', 'warning', 'do not', "don't", 'shocked', 'surprised', 'hidden', 'nobody tells you',
]

type Sentence = { start: number; end: number; words: Word[]; text: string }

function sentences(words: Word[]): Sentence[] {
  const out: Sentence[] = []
  let cur: Word[] = []
  const flush = () => {
    if (!cur.length) return
    out.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur, text: cur.map((w) => w.text).join(' ') })
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

function findHooks(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^\w’' ]+/g, ' ')} `
  return HOOKS.filter((h) => t.includes(` ${h} `))
}

/**
 * `relative` (default, for whole videos): scores are spread 1–99 across this video's candidates.
 * `absolute` (for live windows): a fixed curve, so a score of 80 means the same thing in every window —
 * needed for auto-clip thresholds.
 */
export function detectMoments(
  words: Word[],
  db: number[],
  duration: number,
  opts: { scale?: 'relative' | 'absolute'; maxMoments?: number } = {},
): DetectedMoment[] {
  if (words.length < 20 || duration < MIN_LEN + 5) return []

  // Normalise loudness against audible windows only (ignore silence when computing the baseline).
  const audible = db.filter((d) => d > -50)
  const baseline = median(audible)
  const spread = std(audible)
  const z = db.map((d) => (d - baseline) / spread)
  const globalPace = words.length / Math.max(1, words[words.length - 1].end - words[0].start)

  const sents = sentences(words)
  type Candidate = DetectedMoment & { raw: number }
  const candidates: Candidate[] = []

  for (let i = 0; i < sents.length; i++) {
    for (let j = i; j < sents.length; j++) {
      const start = Math.max(0, sents[i].start - 0.25)
      const end = Math.min(duration, sents[j].end + 0.4)
      const len = end - start
      if (len < MIN_LEN) continue
      if (len > MAX_LEN) break

      const zs = z.slice(Math.floor(start / WINDOW_SEC), Math.ceil(end / WINDOW_SEC))
      const top = [...zs].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(zs.length * 0.2)))
      const loud = mean(top)
      const peak = Math.max(...zs)
      const silence = zs.filter((v) => v < -1.5).length / Math.max(1, zs.length)

      const ws = sents.slice(i, j + 1).flatMap((s) => s.words)
      const text = ws.map((w) => w.text).join(' ')
      const openingText = ws.filter((w) => w.start < start + 6).map((w) => w.text).join(' ')
      const hooks = findHooks(text)
      const openingHooks = findHooks(openingText)
      const pace = ws.length / len / globalPace

      const lengthFit = len >= IDEAL_MIN && len <= IDEAL_MAX ? 0.4 : 0
      const opensWithQuestion = /\?/.test(sents[i].text) ? 0.5 : 0
      const raw =
        1.0 * loud +
        0.35 * Math.min(peak, 4) +
        0.9 * openingHooks.length +
        0.25 * Math.min(hooks.length, 6) +
        0.8 * (pace - 1) +
        opensWithQuestion +
        lengthFit -
        2.0 * silence

      candidates.push({
        start,
        end,
        raw,
        score: 0,
        title: sents[i].text.length > 90 ? `${sents[i].text.slice(0, 87)}…` : sents[i].text,
        transcript: text,
        signals: {
          loudness: +loud.toFixed(2),
          peak: +peak.toFixed(2),
          hooks,
          pace: +pace.toFixed(2),
          silence: +silence.toFixed(2),
          words: ws.map((w) => [+w.start.toFixed(2), +w.end.toFixed(2), w.text]),
        },
      })
    }
  }
  if (!candidates.length) return []

  // Greedy pick of the best non-overlapping windows.
  candidates.sort((a, b) => b.raw - a.raw)
  const picked: Candidate[] = []
  for (const c of candidates) {
    if (picked.length >= (opts.maxMoments ?? MAX_MOMENTS)) break
    if (picked.every((p) => c.end + MIN_GAP <= p.start || c.start >= p.end + MIN_GAP)) picked.push(c)
  }

  // Map raw scores onto 1–99 relative to everything we considered in this video.
  const raws = candidates.map((c) => c.raw)
  const lo = median(raws)
  const hi = Math.max(...raws)
  const clamp = (n: number) => Math.round(Math.min(99, Math.max(1, n)))
  for (const p of picked) {
    p.score =
      opts.scale === 'absolute'
        ? clamp(100 * (1 - Math.exp(-Math.max(0, p.raw) / 2.2))) // raw 2 → 60, 3 → 74, 4 → 84, 5 → 90
        : clamp(50 + (49 * (p.raw - lo)) / Math.max(0.001, hi - lo))
  }
  return picked.map(({ raw: _raw, ...m }) => m)
}
