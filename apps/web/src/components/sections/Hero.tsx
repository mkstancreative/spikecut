import { ArrowRight, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { PhoneClip } from '@/components/mocks/PhoneClip'
import { SpikeTimeline } from '@/components/mocks/SpikeTimeline'
import { Button } from '@/components/ui/Button'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 grid-bg [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-spike/10 blur-[120px]"
      />

      <div className="container-page relative grid items-center gap-12 pt-16 pb-20 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:pb-28">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ink-300">
            <Zap className="size-3.5 text-spike" />
            Autopilot for stream clippers
          </span>
          <h1 className="mt-6 font-display text-5xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Catch the spike.
            <br />
            <span className="text-spike">Ship the clip.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-pretty text-ink-400">
            Pick the streamers you clip. SpikeCut watches every broadcast, spots the moments chat loses its mind, and
            turns them into captioned vertical clips that post themselves.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button to="/signup" size="lg">
              Start clipping <ArrowRight className="size-4" />
            </Button>
            <Button to="/how-it-works" variant="secondary" size="lg">
              See how it works
            </Button>
          </div>
          <p className="mt-4 text-sm text-ink-500">Start with a 24-hour Day Pass. No subscription needed.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative mx-auto w-full max-w-xl"
        >
          <SpikeTimeline className="sm:mr-32" />
          <div className="absolute top-12 -right-2 hidden w-40 rotate-3 sm:block">
            <PhoneClip />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
