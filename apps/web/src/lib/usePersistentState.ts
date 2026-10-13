import { useEffect, useState } from 'react'

/**
 * useState that survives reloads via localStorage (per browser). Storage can be blocked
 * (private mode, disabled site data), so every access is wrapped and falls back to the default.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* not persisted — fine */
    }
  }, [key, value])
  return [value, setValue] as const
}
