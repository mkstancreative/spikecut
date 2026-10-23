import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { CreatorList } from '@/components/mocks/CreatorList'
import { PhoneClip } from '@/components/mocks/PhoneClip'
import { PublishCalendar } from '@/components/mocks/PublishCalendar'
import { SourceList } from '@/components/mocks/SourceList'
import { SpikeTimeline } from '@/components/mocks/SpikeTimeline'
import { StylePreview } from '@/components/mocks/StylePreview'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { cn } from '@/lib/cn'

const steps: { title: string; body: string; visual: ReactNode; soon?: boolean }[] = [
  {
    title: 'Bring in a video',
    body: 'Follow creators on YouTube, TikTok, Instagram or Twitch and their new uploads land in your library. Or paste any video link — X included — or upload a file straight from your device.',
    visual: <SourceList />,
  },
  {
    title: 'Find the moments',
    body: 'Press Find moments and AI reads the transcript for stories, punchlines and hooks while listening for peaks, laughter and pace. Moments never cut mid-sentence, and finding them is free.',
    visual: <SpikeTimeline compact />,
  },
  {
    title: 'Make the clips',
    body: 'Pick the moments you like. Each one is trimmed, reframed to 9:16 around the speaker and captioned word-by-word — one credit per clip, refunded if a render fails.',
    visual: (
      <div className="mx-auto w-40">
        <PhoneClip />
      </div>
    ),
  },
  {
    title: 'Or animate it',
    body: 'Send a video to Animate to turn it into 3D animation, anime, claymation or comic book, and describe the scene you want. Watercolour, sketch and film-grade filters are free.',
    visual: <StylePreview />,
  },
  {
    title: 'Schedule everywhere',
    body: 'Queue clips and cartoons to YouTube Shorts, TikTok, Instagram Reels and Facebook Pages at the times you choose, in your own time zone.',
    visual: <PublishCalendar />,
  },
  {
    title: 'Clip live streams',
    body: 'SpikeCut already shows which of your creators are live, checked every minute. Next, it will record those streams and surface moments while the stream is still going.',
    visual: <CreatorList />,
    soon: true,
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="container-page py-24 sm:py-32">
      <SectionHeading
        eyebrow="How it works"
        title="From any video to a posted clip — without touching an editor."
        intro="Bring a video, pick the moments, and schedule the results. SpikeCut handles the finding, cutting, captioning and posting."
      />
      <ol className="mt-16 grid gap-6 md:grid-cols-2">
        {steps.map((step, i) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: (i % 2) * 0.08 }}
            className="card flex flex-col overflow-hidden"
          >
            <div className={cn('flex min-h-72 items-center justify-center bg-ink-850/60 p-6', step.soon && 'opacity-50 grayscale')}>
              <div className="w-full max-w-sm">{step.visual}</div>
            </div>
            <div className="border-t border-white/6 p-6">
              {step.soon ? (
                <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-ink-300 uppercase">
                  Coming soon
                </span>
              ) : (
                <span className="font-mono text-xs text-spike">0{i + 1}</span>
              )}
              <h3 className="mt-2 font-display text-xl font-bold">{step.title}</h3>
              <p className="mt-2 text-ink-400">{step.body}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}
