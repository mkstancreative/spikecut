import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/SectionHeading'

export default function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <section className="container-page flex min-h-[60vh] flex-col items-start justify-center py-24">
      <Eyebrow>In progress</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-400">{blurb}</p>
      <Button to="/" variant="secondary" className="mt-8">
        Back to home
      </Button>
    </section>
  )
}
