import { BarChart3, Captions, Crop, Radar, Send, Waves } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading'

export const features = [
  {
    icon: Radar,
    title: 'Always-on monitoring',
    body: 'Twitch, YouTube, Kick and podcast feeds watched around the clock. New streams are picked up within a minute of going live.',
  },
  {
    icon: Waves,
    title: 'Spike detection',
    body: 'Chat velocity, emote bursts, audio peaks and transcript hooks combine into one score so the best moments rise to the top.',
  },
  {
    icon: Crop,
    title: 'Smart 9:16 reframing',
    body: 'Face and speaker tracking keeps the action centred when landscape streams become vertical clips.',
  },
  {
    icon: Captions,
    title: 'Word-by-word captions',
    body: 'Animated captions with highlight colours, emoji and safe zones. Save your look as a reusable style.',
  },
  {
    icon: Send,
    title: 'Hands-free publishing',
    body: 'Schedule to YouTube Shorts, Instagram Reels and Facebook with per-platform titles and hashtags. TikTok is next.',
  },
  {
    icon: BarChart3,
    title: 'Growth analytics',
    body: 'See which creators, hooks and caption styles earn the views, then let SpikeCut lean into what works.',
  },
]

export function Features() {
  return (
    <section id="features" className="container-page py-24 sm:py-32">
      <SectionHeading
        eyebrow="Features"
        title="A full clipping team, compressed into one tab."
        intro="Everything between “they’re live” and “it’s posted” — automated, but always yours to override."
      />
      <ul className="mt-14 grid gap-px overflow-hidden rounded-(--radius-card) border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <li key={title} className="bg-ink-900 p-7 transition-colors hover:bg-ink-850">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-spike/10 text-spike">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
