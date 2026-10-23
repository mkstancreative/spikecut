import { AnimateStyles } from '@/components/sections/AnimateStyles'
import { Audiences } from '@/components/sections/Audiences'
import { Faq } from '@/components/sections/Faq'
import { Features } from '@/components/sections/Features'
import { FinalCta } from '@/components/sections/FinalCta'
import { Hero } from '@/components/sections/Hero'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { LiveNow } from '@/components/sections/LiveNow'
import { Platforms } from '@/components/sections/Platforms'
import { Pricing } from '@/components/sections/Pricing'

export default function Home() {
  return (
    <>
      <Hero />
      <Platforms />
      <HowItWorks />
      <LiveNow />
      <Features />
      <AnimateStyles />
      <Audiences />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  )
}
