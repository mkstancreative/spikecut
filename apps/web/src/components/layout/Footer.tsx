import { Link } from 'react-router'
import { Logo } from '@/components/ui/Logo'
import { brand } from '@/lib/brand'
import { footerNav } from '@/lib/nav'

export function Footer() {
  return (
    <footer className="border-t border-white/8 bg-ink-950">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.3fr_2fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm text-ink-400">
            Autopilot for stream clippers. We find the spike, you keep the reach.
          </p>
          <a href={`mailto:${brand.email}`} className="mt-4 inline-block text-sm text-ink-300 hover:text-spike">
            {brand.email}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {footerNav.map((group) => (
            <div key={group.title}>
              <h3 className="font-mono text-xs tracking-[0.16em] text-ink-500 uppercase">{group.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-sm text-ink-300 hover:text-ink-100">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/6">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-ink-500 sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          <p>Source media is processed temporarily and deleted after rendering.</p>
        </div>
      </div>
    </footer>
  )
}
