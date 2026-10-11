import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function FinalCta() {
  return (
    <section className="container-page pb-24 sm:pb-32">
      <div className="relative overflow-hidden rounded-[2rem] bg-spike px-6 py-16 text-center text-ink-950 sm:px-12 sm:py-20">
        <div aria-hidden className="absolute inset-0 opacity-20 [background-image:repeating-linear-gradient(115deg,transparent_0_22px,rgb(11_12_14/0.25)_22px_24px)]" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            Your next viral clip is happening live right now.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-ink-950/70">Set up in five minutes. Let SpikeCut catch it.</p>
          <Button
            to="/signup"
            size="lg"
            className="mt-8 bg-ink-950 text-ink-100 shadow-none hover:bg-ink-800"
          >
            Start clipping <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
