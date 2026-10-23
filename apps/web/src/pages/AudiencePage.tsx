import { ArrowRight, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { FinalCta } from '@/components/sections/FinalCta'
import { Button } from '@/components/ui/Button'
import { Eyebrow, SectionHeading } from '@/components/ui/SectionHeading'

export type Audience = {
  eyebrow: string
  title: ReactNode
  intro: string
  visual: ReactNode
  benefitsTitle: string
  benefits: { icon: LucideIcon; title: string; body: string }[]
  steps: { title: string; body: string }[]
  note?: { title: string; body: string }
}

// Long-form landing page for one audience (/for-clippers, /for-creators): hero, benefits, workflow, closing CTA.
export default function AudiencePage({ audience: a }: { audience: Audience }) {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 grid-bg [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        <div className="container-page relative grid items-center gap-12 pt-16 pb-20 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-28">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Eyebrow>{a.eyebrow}</Eyebrow>
            <h1 className="mt-4 font-display text-5xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-6xl">
              {a.title}
            </h1>
            <p className="mt-6 max-w-lg text-lg text-pretty text-ink-400">{a.intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button to="/signup" size="lg">
                Start clipping <ArrowRight className="size-4" />
              </Button>
              <Button to="/pricing" variant="secondary" size="lg">
                See pricing
              </Button>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative mx-auto w-full max-w-md"
          >
            {a.visual}
          </motion.div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-ink-900/40">
        <div className="container-page py-24 sm:py-32">
          <SectionHeading eyebrow="What you get" title={a.benefitsTitle} />
          <ul className="mt-14 grid gap-px overflow-hidden rounded-(--radius-card) border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
            {a.benefits.map(({ icon: Icon, title, body }) => (
              <li key={title} className="bg-ink-900 p-7">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-spike/10 text-spike">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-page py-24 sm:py-32">
        <SectionHeading eyebrow="Your workflow" title="Set up once. Then it’s a few clicks a day." />
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {a.steps.map((step, i) => (
            <li key={step.title} className="card p-6">
              <span className="font-mono text-xs text-spike">0{i + 1}</span>
              <h3 className="mt-2 font-display text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-400">{step.body}</p>
            </li>
          ))}
        </ol>
        {a.note && (
          <div className="card mt-5 border-dashed p-6">
            <h3 className="font-semibold">{a.note.title}</h3>
            <p className="mt-1 text-sm text-ink-400">{a.note.body}</p>
          </div>
        )}
      </section>

      <FinalCta />
    </>
  )
}
