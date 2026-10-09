import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/cn'
import { mainNav } from '@/lib/nav'

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors',
        scrolled || open ? 'border-white/8 bg-ink-950/85 backdrop-blur-xl' : 'border-transparent',
      )}
    >
      <nav className="container-page flex h-16 items-center justify-between gap-6">
        <Link to="/" aria-label="SpikeCut home">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3 py-2 text-sm transition-colors',
                    isActive ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100',
                  )
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <Button to="/login" variant="ghost" size="sm">
            Log in
          </Button>
          <Button to="/signup" size="sm">
            Start clipping
          </Button>
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-ink-300 hover:text-ink-100 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open && (
        <div className="container-page pb-6 lg:hidden">
          <ul className="flex flex-col gap-1 border-t border-white/8 pt-4">
            {mainNav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className="block rounded-lg px-2 py-2.5 text-ink-300 hover:bg-white/5 hover:text-ink-100">
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button to="/login" variant="secondary">
              Log in
            </Button>
            <Button to="/signup">Start clipping</Button>
          </div>
        </div>
      )}
    </header>
  )
}
