import { Captions, Crop, Radar, Send, Wand2, Waves } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading'

export const features = [
  {
    icon: Radar,
    title: 'Always-on monitoring',
    body: 'Follow creators on YouTube, TikTok, Instagram and Twitch. Live streams are checked every minute, and new uploads land in your library. Or paste any video link — X included.',
  },
  {
    icon: Waves,
    title: 'AI moment finding',
    body: 'AI reads the whole transcript for stories, punchlines and hooks, blended with audio peaks, laughter and pace. Finding moments is free — credits only go on clips you make.',
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
    icon: Wand2,
    title: 'Animate into cartoons',
    body: 'Turn any video into 3D animation, anime, claymation or comic book — and describe the scene you want. Filters like watercolour, pencil sketch and film grades are free.',
  },
  {
    icon: Send,
    title: 'Scheduled publishing',
    body: 'Queue clips and cartoons to YouTube Shorts, TikTok, Instagram Reels and Facebook Pages, timed in your own time zone.',
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
