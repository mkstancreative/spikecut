import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { RequireAuth } from '@/components/app/RequireAuth'
import { RequirePlan } from '@/components/app/RequirePlan'
import { AppLayout } from '@/components/layout/AppLayout'
import { SiteLayout } from '@/components/layout/SiteLayout'
import { Faq } from '@/components/sections/Faq'
import { Features } from '@/components/sections/Features'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Pricing } from '@/components/sections/Pricing'
import { AuthProvider } from '@/lib/auth'
import Accounts from '@/pages/app/Accounts'
import Billing from '@/pages/app/Billing'
import Clips from '@/pages/app/Clips'
import Creators from '@/pages/app/Creators'
import Live from '@/pages/app/Live'
import Onboarding from '@/pages/app/Onboarding'
import Overview from '@/pages/app/Overview'
import Schedule from '@/pages/app/Schedule'
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
          { path: 'billing', element: <Billing /> },
          { path: 'settings', element: <Settings /> },
          {
            element: (
              <RequirePlan>
                <Outlet />
              </RequirePlan>
            ),
            children: [
              { index: true, element: <Overview /> },
              { path: 'creators', element: <Creators /> },
              { path: 'live', element: <Live /> },
              { path: 'clips', element: <Clips /> },
              { path: 'schedule', element: <Schedule /> },
              { path: 'accounts', element: <Accounts /> },
              ...upcoming.map(({ path, ...props }) => ({ path, element: <Upcoming {...props} /> })),
            ],
          },
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
