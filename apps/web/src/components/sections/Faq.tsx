import { Plus } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading'

const faqs = [
  {
    q: 'Do you keep copies of the streams?',
    a: 'No. Source footage is held only as long as it takes to find moments and render clips, then it’s deleted. Your finished clips stay in your library until you remove them.',
  },
  {
    q: 'Can clips publish without me checking them?',
    a: 'Yes. Each creator you watch can be set to “review first” or “auto-publish”. Most clippers start with review and switch to auto once they trust the scoring.',
  },
  {
    q: 'Which platforms can I watch and post to?',
    a: 'We watch Twitch, YouTube, Kick and podcast feeds. We post to YouTube Shorts, Instagram Reels and Facebook. TikTok posting is in review and coming soon.',
  },
  {
    q: 'Do I need permission from the creator?',
    a: 'You’re responsible for having the rights to clip and repost content. Many creators run clipping programmes or welcome clippers — we recommend getting permission in writing. Creators can also ask to be added to our opt-out list.',
  },
  {
    q: 'What happens when I run out of clips for the month?',
    a: 'Monitoring keeps running and moments are still detected, but rendering pauses until your plan renews or you upgrade. You can top up with a Day Pass at any time.',
  },
  {
    q: 'Does the Day Pass renew automatically?',
    a: 'Never. It’s a one-time payment for 24 hours of access. Monthly plans renew each month until you cancel.',
  },
  {
    q: 'Will my clips have a watermark?',
    a: 'No. Every paid plan, including the Day Pass, exports clean video.',
  },
  {
    q: 'Can you guarantee my clips go viral?',
    a: 'No one honestly can. We surface the moments audiences reacted to most and help you post consistently — the two things that move the needle most.',
  },
  {
    q: 'Which countries and currencies do you support?',
    a: 'SpikeCut works worldwide. We price in Naira, Cedis and US Dollars, and accept cards, bank transfer and mobile money through Paystack.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="container-page grid gap-12 py-24 sm:py-32 lg:grid-cols-[1fr_1.6fr]">
      <SectionHeading eyebrow="FAQ" title="Questions, answered plainly." />
      <div className="divide-y divide-white/8 border-y border-white/8">
        {faqs.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <Plus className="size-5 shrink-0 text-ink-500 transition-transform group-open:rotate-45 group-open:text-spike" />
            </summary>
            <p className="mt-3 pr-8 text-ink-400">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
