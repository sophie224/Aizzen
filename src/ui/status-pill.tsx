import type { ActionStatus, RiskStatus } from '../domain/types/index.ts'
import { statusTone } from './status-tone.ts'

/** Status pill. The word is always rendered; the tone only reinforces it. */
export function StatusPill({
  status,
  className,
}: {
  status: RiskStatus | ActionStatus
  className?: string
}) {
  return (
    <span className={`pill pill--${statusTone(status)}${className ? ` ${className}` : ''}`}>
      {status}
    </span>
  )
}
