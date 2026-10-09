import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-spike text-ink-950 hover:bg-spike-dim shadow-[0_0_0_1px_rgb(200_255_46/0.4),0_8px_30px_-8px_rgb(200_255_46/0.5)]',
  secondary: 'bg-white/6 text-ink-100 border border-white/10 hover:bg-white/10',
  ghost: 'text-ink-300 hover:text-ink-100',
  danger: 'border border-cut/40 text-cut hover:bg-cut/10',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

type Props = {
  to: string
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
} & Omit<ComponentProps<'a'>, 'href'>

export function buttonClasses({ variant = 'primary', size = 'md', className }: { variant?: Variant; size?: Size; className?: string }) {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spike disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

export function Button({ to, variant = 'primary', size = 'md', className, children, ...rest }: Props) {
  const classes = buttonClasses({ variant, size, className })
  const external = /^(https?:|mailto:)/.test(to) || to.startsWith('#')
  if (external) {
    return (
      <a href={to} className={classes} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} className={classes} {...rest}>
      {children}
    </Link>
  )
}
