/*
 * Inline icon set for the Risk Management module.
 *
 * Icons are decorative by default (`aria-hidden`): every control that uses one
 * carries its own visible label or `aria-label`, so an icon never becomes the
 * only carrier of meaning (ARCHITECTURE.md §9).
 */

import type { ReactNode } from 'react'

export interface IconProps {
  /** Square size in `rem`-independent pixels; defaults to 16. */
  size?: number
  className?: string
}

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconSearch = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const IconFilter = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
  </Svg>
)

export const IconColumns = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 4v16" />
  </Svg>
)

export const IconStar = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Svg {...props}>
    <path
      d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
)

export const IconTrash = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
  </Svg>
)

export const IconPlus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconSave = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </Svg>
)

export const IconDownload = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
  </Svg>
)

export const IconChevronLeft = (props: IconProps) => (
  <Svg {...props}>
    <path d="m14 6-6 6 6 6" />
  </Svg>
)

export const IconChevronRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="m10 6 6 6-6 6" />
  </Svg>
)

export const IconClose = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)

export const IconWarning = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4 2.8 20h18.4Z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Svg>
)

export const IconList = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const IconPencil = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="m14 6 4 4" />
  </Svg>
)

export const IconSignOut = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 5h5v14h-5" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </Svg>
)

export const IconGauge = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="m12 14 4-4" />
  </Svg>
)

export const IconShield = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3 5 6v6c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6Z" />
  </Svg>
)

export const IconChart = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
)

export const IconSettings = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
  </Svg>
)

export const IconGlobe = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z" />
  </Svg>
)

/** Directional glyph shared by trend, direction-to-target and outlook chips. */
export function IconTrend({ direction, ...props }: IconProps & { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') {
    return (
      <Svg {...props}>
        <path d="M4 17 10 11l4 4 6-6" />
        <path d="M15 9h5v5" />
      </Svg>
    )
  }
  if (direction === 'down') {
    return (
      <Svg {...props}>
        <path d="M4 7l6 6 4-4 6 6" />
        <path d="M15 15h5v-5" />
      </Svg>
    )
  }
  return (
    <Svg {...props}>
      <path d="M4 12h13" />
      <path d="m14 8 4 4-4 4" />
    </Svg>
  )
}
