import type { ReactNode } from 'react'
import { FinalCta } from '@/components/sections/FinalCta'

// Wraps a homepage section as its own route (e.g. /pricing) with the closing CTA.
export default function SectionPage({ children }: { children: ReactNode }) {
  return (
    <div className="pt-4">
      {children}
      <FinalCta />
    </div>
  )
}
