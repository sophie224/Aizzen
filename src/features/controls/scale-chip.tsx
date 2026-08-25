import { levelBadgeColors } from '../../domain/risk-engine/contrast.ts'
import { scaleColor, scaleLabel, type ControlScaleName } from '../../domain/controls/index.ts'
import type { ControlConfig, Language } from '../../domain/types/index.ts'

/*
 * A configured scale value, rendered as the platform pill.
 *
 * ONE badge implementation: this is `.pill` with the `--level` variant, not a
 * second chip (Design Uplift v2 §4.4). The colour pair comes from
 * `levelBadgeColors`, which keeps small text off the raw configured fill
 * (§6.2) — text on a heavy tint clears 4.5:1 for any hue, and the fill appears
 * only as the leading bar, a non-text indicator at 3:1.
 *
 * The level NAME is always rendered, so meaning never depends on colour.
 */

export interface ScaleChipProps {
  config: ControlConfig
  scale: ControlScaleName
  value: string
  language: Language
}

export function ScaleChip({ config, scale, value, language }: ScaleChipProps) {
  if (value === '') return <span className="pill pill--neutral">—</span>

  const fill = scaleColor(config, scale, value)
  const label = scaleLabel(config, scale, value, language)
  if (fill === '') return <span className="pill pill--neutral">{label}</span>

  const { surface, indicator } = levelBadgeColors(fill)

  return (
    <span
      className="pill pill--level"
      style={
        {
          '--pill-level-surface': surface,
          '--pill-level-indicator': indicator,
        } as React.CSSProperties
      }
    >
      {label}
    </span>
  )
}
