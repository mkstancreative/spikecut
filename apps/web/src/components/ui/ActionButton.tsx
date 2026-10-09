import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'
import { buttonClasses, type Size, type Variant } from './Button'

type Props = ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean }

export function ActionButton({ variant, size, loading, className, children, disabled, type = 'button', ...rest }: Props) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClasses({ variant, size, className })} {...rest}>
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  )
}
