import type { ReactNode } from 'react'

/*
 * Empty state (CR-005 §4.4).
 *
 * One component for every "nothing to show here" surface, so the Register, the
 * dashboard widgets and Administration read the same way: an optional icon, a
 * heading naming the state, one sentence of explanation, and at most one action.
 *
 * The distinction between "no records in scope" and "filters matched nothing"
 * is the caller's — this only fixes how either is presented.
 */

export interface EmptyStateProps {
  /** Decorative glyph; omitted where a heading alone is enough. */
  icon?: ReactNode
  title?: string
  /** One sentence. Longer copy belongs in help, not here. */
  body: string
  /** At most one action, e.g. "Clear filters". */
  action?: ReactNode
  /** Tighter padding, for use inside a widget or a card. */
  inline?: boolean
}

export function EmptyState({ icon, title, body, action, inline = false }: EmptyStateProps) {
  return (
    <div className={inline ? 'empty-state empty-state--inline' : 'empty-state'}>
      {icon ? (
        <span className="empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {title ? <h2 className="empty-state__title">{title}</h2> : null}
      <p>{body}</p>
      {action}
    </div>
  )
}
