import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useTranslation } from '../../i18n/index.ts'

/*
 * A register cell whose content is clamped to the row height and expands into
 * a popover when there is more to read (Description and Action plan).
 *
 * Presentation only: the popover shows exactly the content the cell already
 * renders, unclamped. It reads nothing, computes nothing and mutates nothing.
 *
 * The popover is portalled to the body and positioned from the cell's viewport
 * rect, because the compact row clips its own overflow — a popover nested
 * inside the cell would be cut off at the row edge.
 */

export interface ExpandableCellProps {
  /** The clamped content, as it appears in the row. */
  children: ReactNode
  /** The same content, unclamped, for the popover. */
  expanded?: ReactNode
  /** Accessible name for the expand affordance, e.g. "Show full description". */
  label: string
}

interface Anchor {
  top: number
  left: number
  width: number
  below: boolean
}

/** Popover width tracks the cell but stays readable on a narrow column. */
const MIN_WIDTH = 320
const MAX_WIDTH = 560
const GAP = 6

function anchorFrom(element: HTMLElement): Anchor {
  const rect = element.getBoundingClientRect()
  const below = rect.bottom + 240 < window.innerHeight || rect.top < 240
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, rect.width))
  // Keep the panel inside the viewport when the column sits near the edge.
  const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - width - GAP)

  return {
    top: below ? rect.bottom + GAP : rect.top - GAP,
    left,
    width,
    below,
  }
}

export function ExpandableCell({ children, expanded, label }: ExpandableCellProps) {
  const { t } = useTranslation()
  const cellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [clamped, setClamped] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  const open = anchor !== null

  const close = useCallback(
    (restoreFocus: boolean) => {
      setAnchor(null)
      if (restoreFocus) cellRef.current?.focus()
    },
    [],
  )

  /*
   * Whether the content overflows its clamp. Measured rather than guessed from
   * a character count, so it stays right at any column width, font or language.
   */
  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return

    const measure = () => {
      setClamped(node.scrollHeight > node.clientHeight + 1)
    }
    measure()

    // Guarded: not every environment the component renders in provides it.
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [children])

  // Escape, outside click and any scroll dismiss the panel.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close(true)
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || cellRef.current?.contains(target)) return
      close(false)
    }
    const onScroll = () => {
      close(false)
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onScroll)

    /*
     * The scroll listener waits one frame. Focusing the cell can make the
     * browser scroll it into view, and that scroll would otherwise dismiss the
     * panel in the same gesture that opened it. Capture phase, so a scroll
     * inside the table's own scrollport closes it too.
     */
    const frame = requestAnimationFrame(() => {
      window.addEventListener('scroll', onScroll, true)
    })

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, close])

  const toggle = () => {
    if (!clamped) return
    setAnchor(open ? null : anchorFrom(cellRef.current as HTMLElement))
  }

  if (!clamped && !open) {
    return (
      <div className="expandable" ref={cellRef}>
        <div className="expandable__content" ref={contentRef}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="expandable is-expandable"
        ref={cellRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={label}
        onClick={(event) => {
          // The row itself is a navigation target; expanding must not follow it.
          event.stopPropagation()
          toggle()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            toggle()
          }
        }}
      >
        <div className="expandable__content" ref={contentRef}>
          {children}
        </div>
        <span className="expandable__more" aria-hidden="true">
          {t('register.cell.more')}
        </span>
      </div>

      {open
        ? createPortal(
            <div
              className="expandable-popover"
              ref={panelRef}
              role="dialog"
              aria-label={label}
              style={{
                top: anchor.below ? anchor.top : undefined,
                bottom: anchor.below ? undefined : window.innerHeight - anchor.top,
                left: anchor.left,
                width: anchor.width,
              }}
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {expanded ?? children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
