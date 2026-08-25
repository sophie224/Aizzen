import { useEffect, useState } from 'react'

/**
 * Debounced mirror of a search term (§9.4, §12.2).
 *
 * The input stays fully controlled so typing is never laggy; only the value
 * the grid filters on is delayed, which is what keeps a 10 000-row register
 * from re-filtering on every keystroke.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value)
    }, delay)
    return () => {
      window.clearTimeout(timer)
    }
  }, [value, delay])

  return settled
}
