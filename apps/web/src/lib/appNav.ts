import { BarChart3, CalendarClock, CreditCard, Film, LayoutDashboard, Link2, Radio, Settings, Users, Wand2 } from 'lucide-react'

export const appNav = [
  { label: 'Overview', to: '/app', icon: LayoutDashboard, end: true },
  { label: 'Creators', to: '/app/creators', icon: Users },
  { label: 'Live', to: '/app/live', icon: Radio },
  { label: 'Clips', to: '/app/clips', icon: Film },
  { label: 'Animate', to: '/app/animate', icon: Wand2 },
  { label: 'Schedule', to: '/app/schedule', icon: CalendarClock },
  { label: 'Accounts', to: '/app/accounts', icon: Link2 },
  { label: 'Analytics', to: '/app/analytics', icon: BarChart3 },
]

export const appNavFooter = [
  { label: 'Billing', to: '/app/billing', icon: CreditCard },
  { label: 'Settings', to: '/app/settings', icon: Settings },
]
