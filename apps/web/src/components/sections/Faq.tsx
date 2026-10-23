import { Plus } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading'

const faqs = [
  {
    q: 'Do you keep copies of the streams?',
    a: 'No. Source footage is held only as long as it takes to find moments and render clips, then it’s deleted. Your finished clips stay in your library until you remove them.',
  },
  {
    q: 'Do I choose which clips get posted?',
    a: 'Yes. SpikeCut finds and ranks the moments; you pick the ones worth a clip and schedule each one for when and where it should go out. Nothing posts without you queuing it.',
  },
  {
    q: 'Which platforms can I watch and post to?',
    a: 'We watch creators on YouTube, TikTok, Instagram and Twitch, and you can paste a single video link from those or X. We post to YouTube Shorts, TikTok, Instagram Reels and Facebook Pages. Kick support is coming soon.',
  },
  {
    q: 'Do TikTok posts go up publicly?',
    a: 'Until TikTok finishes approving SpikeCut, posts land on your profile as private (“Only me”). You can switch them to public in the TikTok app in one tap.',
  },
  {
    q: 'What is Animate?',
    a: 'Animate turns a whole video into a cartoon — 3D animated, anime, claymation or comic book — and you can describe the scene you want. Those AI styles use credits. Filters like watercolour, pencil sketch, teal & orange, golden hour, vintage film and noir are free.',
  },
  {
    q: 'Do I need permission from the creator?',
    a: 'You’re responsible for having the rights to clip and repost content. Many creators run clipping programmes or welcome clippers — we recommend getting permission in writing. Creators can also ask to be added to our opt-out list.',
  },
  {
    q: 'What happens when I run out of clips for the month?',
    a: 'Monitoring and moment finding are free, so they keep running — but making new clips pauses until your plan renews or you upgrade. You can top up with a Day Pass at any time.',
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
