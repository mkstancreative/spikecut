import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BarChart3, CalendarClock, Film, Link2, Radio, Users } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { RequireAuth } from '@/components/app/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { SiteLayout } from '@/components/layout/SiteLayout'
import { Faq } from '@/components/sections/Faq'
import { Features } from '@/components/sections/Features'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Pricing } from '@/components/sections/Pricing'
import { AuthProvider } from '@/lib/auth'
import Billing from '@/pages/app/Billing'
import Onboarding from '@/pages/app/Onboarding'
import Overview from '@/pages/app/Overview'
import Settings from '@/pages/app/Settings'
import Upcoming from '@/pages/app/Upcoming'
import AuthCallback from '@/pages/auth/AuthCallback'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import Login from '@/pages/auth/Login'
import ResetPassword from '@/pages/auth/ResetPassword'
import Signup from '@/pages/auth/Signup'
import ComingSoon from '@/pages/ComingSoon'
import Home from '@/pages/Home'
import SectionPage from '@/pages/SectionPage'
import './index.css'

// Marketing pages still to be written render a placeholder so every nav link resolves.
const stubs: { path: string; title: string; blurb: string }[] = [
  { path: 'for-clippers', title: 'For clippers', blurb: 'How solo clippers scale to a roster of creators with SpikeCut.' },
  { path: 'for-creators', title: 'For creators', blurb: 'Turn every stream into a week of Shorts and Reels on your own channels.' },
  { path: 'for-agencies', title: 'For agencies', blurb: 'Client workspaces, seats, approvals and bulk scheduling.' },
  { path: 'guide', title: 'Clipping guide', blurb: 'Everything you need to start earning as a clipper.' },
  { path: 'kit', title: 'Starter kit', blurb: 'Templates, caption styles and outreach scripts for new clippers.' },
  { path: 'about', title: 'About SpikeCut', blurb: 'Why we’re building autopilot for clippers.' },
  { path: 'contact', title: 'Contact', blurb: 'Questions, partnerships or support.' },
  { path: 'privacy', title: 'Privacy policy', blurb: 'How we collect, use and protect your data.' },
  { path: 'terms', title: 'Terms of service', blurb: 'The rules for using SpikeCut.' },
  { path: 'copyright', title: 'Copyright & DMCA', blurb: 'How to report content and request creator opt-out.' },
]

const upcoming = [
  {
    path: 'creators',
    title: 'Creators',
    description: 'The streamers and channels SpikeCut watches for you.',
    icon: Users,
    emptyTitle: 'No creators yet',
    emptyBody: 'Soon you’ll paste a Twitch, YouTube or Kick link here and SpikeCut will start watching for live streams and uploads.',
    phase: 'Phase 3',
  },
  {
    path: 'live',
    title: 'Live',
    description: 'Streams being watched and scored right now.',
    icon: Radio,
    emptyTitle: 'Nothing live yet',
    emptyBody: 'When a creator you follow goes live, their stream and its real-time spike score will appear here.',
    phase: 'Phase 3',
  },
  {
    path: 'clips',
    title: 'Clips',
    description: 'Detected moments and finished clips.',
    icon: Film,
    emptyTitle: 'Your clips will land here',
    emptyBody: 'Each detected moment becomes a captioned 9:16 clip you can approve, tweak or auto-publish.',
    phase: 'Phase 4',
  },
  {
    path: 'schedule',
    title: 'Schedule',
    description: 'What’s going out, where and when.',
    icon: CalendarClock,
    emptyTitle: 'Nothing scheduled',
    emptyBody: 'Approved clips are queued here and posted at the best time for each platform.',
    phase: 'Phase 5',
  },
  {
    path: 'accounts',
    title: 'Connected accounts',
    description: 'Where your clips get published.',
    icon: Link2,
    emptyTitle: 'Connect your channels',
    emptyBody: 'Link YouTube, Instagram and Facebook so SpikeCut can post for you. TikTok follows once approved.',
    phase: 'Phase 5',
  },
  {
    path: 'analytics',
    title: 'Analytics',
    description: 'Views and growth across everything you post.',
    icon: BarChart3,
    emptyTitle: 'No data yet',
    emptyBody: 'Once clips are live, you’ll see which creators, hooks and caption styles drive the most views.',
    phase: 'Phase 6',
  },
]

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'features', element: <SectionPage><Features /></SectionPage> },
      { path: 'how-it-works', element: <SectionPage><HowItWorks /></SectionPage> },
      { path: 'pricing', element: <SectionPage><Pricing /><Faq /></SectionPage> },
      ...stubs.map((s) => ({ path: s.path, element: <ComingSoon title={s.title} blurb={s.blurb} /> })),
      { path: '*', element: <ComingSoon title="Page not found" blurb="That link doesn’t go anywhere yet." /> },
    ],
  },
  { path: 'login', element: <Login /> },
  { path: 'signup', element: <Signup /> },
  { path: 'forgot-password', element: <ForgotPassword /> },
  { path: 'reset-password', element: <ResetPassword /> },
  { path: 'auth/callback', element: <AuthCallback /> },
  {
    path: 'app',
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    children: [
      { path: 'welcome', element: <Onboarding /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Overview /> },
          { path: 'billing', element: <Billing /> },
          { path: 'settings', element: <Settings /> },
          ...upcoming.map(({ path, ...props }) => ({ path, element: <Upcoming {...props} /> })),
        ],
      },
    ],
  },
])

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
