import { useQueryClient } from '@tanstack/react-query'
import { LogOut, Menu, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { PlanBadge } from '@/components/app/PlanBadge'
import { LogoMark } from '@/components/ui/Logo'
import { appNav, appNavFooter } from '@/lib/appNav'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useEntitlements, useProfile, useWorkspace } from '@/lib/workspace'

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Menu; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-white/8 font-medium text-ink-100' : 'text-ink-400 hover:bg-white/4 hover:text-ink-100',
        )
      }
    >
      <Icon className="size-4.5" />
      {label}
    </NavLink>
  )
}

function Sidebar() {
  const { user } = useAuth()
  const profile = useProfile()
  const workspace = useWorkspace()
  const ent = useEntitlements(workspace.data?.id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/', { replace: true })
  }

  const name = profile.data?.full_name || user?.email || ''

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/app" className="flex items-center gap-2.5 px-1">
        <LogoMark className="size-7" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{workspace.data?.name ?? 'SpikeCut'}</p>
          {ent.data && <PlanBadge plan={ent.data.plan_id} className="mt-0.5" />}
        </div>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {appNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        {ent.data && (
          <Link to="/app/billing" className="card block p-3.5 transition-colors hover:border-spike/30">
            <div className="flex items-center justify-between text-xs text-ink-400">
              <span>Clip credits</span>
              <Zap className="size-3.5 text-spike" />
            </div>
            <p className="mt-1 font-display text-2xl font-bold">{ent.data.credits.toLocaleString()}</p>
            {ent.data.plan_id === 'free' && <p className="mt-1 text-xs text-spike">Upgrade to render clips →</p>}
          </Link>
        )}
        <nav className="flex flex-col gap-0.5">
          {appNavFooter.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/8 px-1 pt-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-spike/15 text-sm font-bold text-spike uppercase">
            {name.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{name}</p>
            <p className="truncate text-xs text-ink-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-ink-100"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-white/6 bg-ink-900/60 lg:block">
        <Sidebar />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/6 bg-ink-950/90 px-4 backdrop-blur-xl lg:hidden">
        <Link to="/app" aria-label="Dashboard">
          <LogoMark className="size-7" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-ink-300 hover:text-ink-100"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-white/8 bg-ink-900">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 rounded-lg p-2 text-ink-400 hover:text-ink-100"
            >
              <X className="size-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/6 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-ink-400">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
