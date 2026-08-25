import { useState } from 'react'
import { levelBadgeColors } from '../../domain/risk-engine/contrast.ts'
import { scaleColor, scaleLabel, scaleLevels, type ControlScaleName } from '../../domain/controls/index.ts'
import { pickLanguage } from '../../i18n/index.ts'
import type { ControlConfig, Language } from '../../domain/types/index.ts'

/*
 * A scale value that can be changed where it is read (§7, §9.4).
 *
 * The register is where these values are reviewed, so it is where they should
 * be adjustable — without opening the record. The cell keeps the badge design
 * exactly: the dot is the configured colour, the surface is its tint, the name
 * is always text. Nothing about the badge changes when it becomes editable
 * except that it now looks and behaves like a control.
 *
 * Platform-first (§5): this is a NATIVE `<select>`, not a custom popover. It
 * therefore needs no anchor positioning, no top-layer management and no
 * `z-index`, and it arrives with keyboard support, screen-reader semantics and
 * touch behaviour already correct. The badge is the wrapper; the select fills
 * it and carries the accessible name.
 *
 * A user without edit rights gets the read-only badge — the caller decides,
 * because permission is a domain question, not a presentational one.
 */

export interface LevelSelectProps {
  config: ControlConfig
  scale: ControlScaleName
  value: string
  language: Language
  /** Accessible name, e.g. "Effectiveness: Quarterly access review". */
  label: string
  onChange: (next: string) => Promise<void>
}

export function LevelSelect({
  config,
  scale,
  value,
  language,
  label,
  onChange,
}: LevelSelectProps) {
  const [saving, setSaving] = useState(false)

  const fill = scaleColor(config, scale, value)
  const { surface, indicator } = levelBadgeColors(fill === '' ? '#98A0B3' : fill)
  const levels = scaleLevels(config, scale)

  /*
   * A level removed from the configuration after this record was written is
   * still offered, so changing a neighbouring field cannot silently rewrite a
   * historical value the administrator has retired.
   */
  const options = levels.some((level) => level.key === value)
    ? levels
    : [...levels, { key: value, labelEn: value, labelKa: value, color: '' }]

  return (
    <span
      className="pill pill--level level-select"
      data-loading={saving}
      style={
        {
          '--pill-level-surface': surface,
          '--pill-level-indicator': indicator,
        } as React.CSSProperties
      }
    >
      {/* Visible text, so the badge reads identically to a read-only one. */}
      <span className="level-select__value">{scaleLabel(config, scale, value, language)}</span>

      <select
        className="level-select__control"
        aria-label={label}
        aria-busy={saving}
        disabled={saving}
        value={value}
        onChange={(event) => {
          const next = event.target.value
          if (next === value) return

          setSaving(true)
          void onChange(next).finally(() => {
            setSaving(false)
          })
        }}
      >
        {options.map((level) => (
          <option key={level.key} value={level.key}>
            {pickLanguage(level.labelEn, level.labelKa, language) || level.key}
          </option>
        ))}
      </select>
    </span>
  )
}
