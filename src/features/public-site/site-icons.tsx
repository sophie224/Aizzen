/*
 * Inline icon set for the public website.
 *
 * Deliberately local to this feature and deliberately decorative: every icon
 * here sits beside a text label, so each renders `aria-hidden` and carries no
 * meaning of its own (ARCHITECTURE.md §9 — colour and iconography never carry
 * meaning alone).
 */

export type SiteIconName =
  | 'shield'
  | 'check'
  | 'report'
  | 'play'
  | 'chevron'
  | 'menu'
  | 'close'
  | 'globe'
  | 'user'
  | 'layers'
  | 'trendUp'
  | 'settings'
  | 'logout'
  | 'dashboard'
  | 'register'
  | 'mail'
  | 'phone'

const paths: Record<SiteIconName, string> = {
  shield: 'M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6l7-3z',
  check: 'M4.5 12.5l5 5 10-11',
  report: 'M4 20V9M10 20V4M16 20v-7M22 20H2',
  play: 'M7 4.5l12 7.5-12 7.5z',
  chevron: 'M9 5l7 7-7 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  logout: 'M15 17l5-5-5-5M20 12H9M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h5',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  register: 'M4 6h16M4 12h16M4 18h10',
  mail: 'M3 6.5h18v11H3zM3 7l9 6 9-6',
  phone:
    'M6.5 3.5h3l1.5 4-2 1.5a12 12 0 006 6l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A17 17 0 015 5.1 1.5 1.5 0 016.5 3.5z',
}

export interface SiteIconProps {
  name: SiteIconName
  size?: number
}

export function SiteIcon({ name, size = 18 }: SiteIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  )
}
