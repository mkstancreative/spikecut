import { ArrowUpRight, Building2, Scissors, Video } from 'lucide-react'
import { Link } from 'react-router'
import { SectionHeading } from '@/components/ui/SectionHeading'

const audiences = [
  {
    icon: Scissors,
    to: '/for-clippers',
    title: 'Clippers',
    body: 'Cover ten streamers instead of one. Spend your time picking winners and pitching creators, not scrubbing VODs.',
  },
  {
    icon: Video,
    to: '/for-creators',
    title: 'Creators',
    body: 'Turn every stream into a week of Shorts and Reels on your own channels — without hiring an editor.',
  },
  {
    icon: Building2,
    to: '/for-agencies',
    title: 'Agencies',
    body: 'Run a roster of clients from one workspace with seats, approvals and bulk scheduling.',
  },
]

export function Audiences() {
  return (
    <section className="container-page py-24 sm:py-32">
      <SectionHeading
        eyebrow="Who it’s for"
        title="One clipper. The output of a whole team."
        align="center"
      />
      <ul className="mt-14 grid gap-5 md:grid-cols-3">
        {audiences.map(({ icon: Icon, to, title, body }) => (
          <li key={title}>
            <Link to={to} className="card group flex h-full flex-col p-7 transition-colors hover:border-spike/40">
              <div className="flex items-center justify-between">
                <Icon className="size-6 text-spike" />
                <ArrowUpRight className="size-5 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-spike" />
              </div>
              <h3 className="mt-6 font-display text-2xl font-bold">For {title.toLowerCase()}</h3>
              <p className="mt-3 text-ink-400">{body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
