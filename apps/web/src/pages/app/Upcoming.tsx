import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/layout/AppLayout'

// Dashboard sections that are wired up in later build phases.
export default function Upcoming(props: { title: string; description: string; icon: LucideIcon; emptyTitle: string; emptyBody: string; phase: string }) {
  return (
    <>
      <PageHeader title={props.title} description={props.description} />
      <div className="p-4 sm:p-8">
        <EmptyState icon={props.icon} title={props.emptyTitle} body={props.emptyBody} badge={props.phase} />
      </div>
    </>
  )
}
