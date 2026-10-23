import { CalendarClock, Captions, Coins, Radio, Send, Users, Wand2, Waves, Zap } from 'lucide-react'
import { CreatorList } from '@/components/mocks/CreatorList'
import { PhoneClip } from '@/components/mocks/PhoneClip'
import { PublishCalendar } from '@/components/mocks/PublishCalendar'
import { SpikeTimeline } from '@/components/mocks/SpikeTimeline'
import type { Audience } from '@/pages/AudiencePage'
import { plans } from '@/lib/pricing'

// Roster sizes come straight from the plans so this copy can't drift from billing.
const rosterSizes = plans
  .filter((p) => p.period === 'month')
  .map((p) => `${p.limits.creators} on ${p.name}`)
  .join(', ')

export const clippers: Audience = {
  eyebrow: 'For clippers',
  title: (
    <>
      Clip ten creators.
      <br />
      <span className="text-spike">Edit none of it.</span>
    </>
  ),
  intro:
    'SpikeCut watches your roster on YouTube, TikTok, Instagram and Twitch, ranks the moments worth posting, and turns the ones you pick into captioned vertical clips. Your time goes on picking winners and pitching creators — not scrubbing VODs.',
  visual: (
    <div className="space-y-4">
      <CreatorList />
      <SpikeTimeline compact />
    </div>
  ),
  benefitsTitle: 'The output of a clipping team, run by one person.',
  benefits: [
    {
      icon: Users,
      title: 'Cover a whole roster',
      body: `Add creators by pasting a profile link — ${rosterSizes}. New uploads land in your library, and you can see who’s live at a glance.`,
    },
    {
      icon: Waves,
      title: 'Moments ranked for you',
      body: 'AI reads the whole transcript for stories, punchlines and hooks, and listens for peaks, laughter and pace. Clips never start or end mid-sentence.',
    },
    {
      icon: Coins,
      title: 'Only pay for clips you make',
      body: 'Finding moments is free. Each clip you make uses one credit, and if a render fails the credit comes back automatically.',
    },
    {
      icon: Captions,
      title: 'Ready to post, no editor',
      body: 'Every clip is reframed to 9:16 around the speaker with word-by-word captions. Clean exports on every paid plan — no watermark.',
    },
    {
      icon: Wand2,
      title: 'Stand out with Animate',
      body: 'Turn a video into 3D animation, anime, claymation or comic book for a format nobody else in your niche is posting. Watercolour, sketch and film-grade filters are free.',
    },
    {
      icon: Send,
      title: 'One queue, every platform',
      body: 'Schedule to YouTube Shorts, TikTok, Instagram Reels and Facebook Pages from one place, across several accounts at once.',
    },
  ],
  steps: [
    { title: 'Build your roster', body: 'Paste the profile links of the creators you clip. SpikeCut starts watching right away.' },
    { title: 'Scan for moments', body: 'Press Find moments on any stream or upload — or paste a one-off video link. It’s free.' },
    { title: 'Make the clips', body: 'Pick the moments you like. Each one is trimmed, reframed and captioned for one credit.' },
    { title: 'Schedule everywhere', body: 'Queue each clip to the accounts and times you want. Track it all on the Schedule page.' },
  ],
  note: {
    title: 'Clip with permission',
    body: 'You’re responsible for having the rights to clip and repost content. Many creators run clipping programmes or welcome clippers — get permission in writing before you post.',
  },
}

export const creators: Audience = {
  eyebrow: 'For creators',
  title: (
    <>
      Every stream becomes
      <br />
      <span className="text-spike">a week of Shorts.</span>
    </>
  ),
  intro:
    'Add your own channel and SpikeCut finds the best moments in every stream and upload, cuts them into captioned vertical clips, and posts them to your YouTube, TikTok, Instagram and Facebook. No editor to hire.',
  visual: (
    <div className="relative">
      <PublishCalendar className="sm:mr-24" />
      <div className="absolute -top-6 -right-2 hidden w-36 rotate-3 sm:block">
        <PhoneClip />
      </div>
    </div>
  ),
  benefitsTitle: 'Your content, on every feed — without the editing.',
  benefits: [
    {
      icon: Radio,
      title: 'Your streams, covered',
      body: 'Add your YouTube, TikTok, Instagram or Twitch channel and new uploads and past streams appear in your library on their own. Live clipping is coming soon.',
    },
    {
      icon: Waves,
      title: 'Your best moments, found',
      body: 'AI reads the transcript for your stories, punchlines and hot takes, and listens for the moments the energy jumps — then ranks them for you.',
    },
    {
      icon: Captions,
      title: 'Clips that look edited',
      body: 'Speaker-tracked 9:16 framing and word-by-word captions, exported clean with no watermark.',
    },
    {
      icon: Wand2,
      title: 'Animate your content',
      body: 'Turn yourself into a 3D character, anime hero or claymation figure — and describe the scene you want. Free filters give clips a film-grade look.',
    },
    {
      icon: CalendarClock,
      title: 'Post on your own channels',
      body: 'Connect your accounts and schedule Shorts, TikToks, Reels and Facebook videos in your own time zone. Nothing goes out unless you queue it.',
    },
    {
      icon: Zap,
      title: 'Try it for a day',
      body: 'Grab a 24-hour Day Pass and clip your latest stream. No subscription, and it never renews.',
    },
  ],
  steps: [
    { title: 'Add your channel', body: 'Paste your profile link. Your recent uploads show up in your library.' },
    { title: 'Connect your socials', body: 'Link YouTube, TikTok, Instagram or a Facebook Page so clips can post for you.' },
    { title: 'Pick your moments', body: 'Find moments on a stream for free, then make clips from the ones you love.' },
    { title: 'Schedule the week', body: 'Spread the clips across the week and platforms. SpikeCut posts them on time.' },
  ],
}
