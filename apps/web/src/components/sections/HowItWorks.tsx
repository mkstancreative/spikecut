import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { CreatorList } from '@/components/mocks/CreatorList'
import { PhoneClip } from '@/components/mocks/PhoneClip'
import { PublishCalendar } from '@/components/mocks/PublishCalendar'
import { SpikeTimeline } from '@/components/mocks/SpikeTimeline'
import { SectionHeading } from '@/components/ui/SectionHeading'

const steps: { title: string; body: string; visual: ReactNode }[] = [
  {
    title: 'Pick who to clip',
    body: 'Paste a profile link from YouTube, TikTok, Instagram or Twitch. SpikeCut starts watching for live streams and new uploads — or drop in any single video link.',
    visual: <CreatorList />,
  },
  {
    title: 'We catch the spikes',
    body: 'AI reads the transcript and listens for peaks, laughter and pace, so you get the moments worth watching — never cut mid-sentence. Finding moments is free.',
    visual: <SpikeTimeline compact />,
  },
  {
    title: 'Clips edit themselves',
    body: 'Pick a moment and it’s trimmed, reframed to 9:16 around the speaker and captioned word-by-word. Or send the whole video to Animate and get it back as a cartoon.',
    visual: (
      <div className="mx-auto w-40">
        <PhoneClip />
      </div>
    ),
  },
  {
    title: 'Posted on schedule',
    body: 'Clips publish to YouTube Shorts, TikTok, Instagram Reels and Facebook at the times you choose.',
    visual: <PublishCalendar />,
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="container-page py-24 sm:py-32">
      <SectionHeading
        eyebrow="How it works"
        title="From live broadcast to posted clip — without touching an editor."
        intro="Set it up once. SpikeCut runs the whole loop while you sleep, study or scout new creators."
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
            <div className="flex min-h-72 items-center justify-center bg-ink-850/60 p-6">
              <div className="w-full max-w-sm">{step.visual}</div>
            </div>
            <div className="border-t border-white/6 p-6">
              <span className="font-mono text-xs text-spike">0{i + 1}</span>
              <h3 className="mt-2 font-display text-xl font-bold">{step.title}</h3>
              <p className="mt-2 text-ink-400">{step.body}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}
