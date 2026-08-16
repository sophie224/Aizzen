import { useId, useState } from 'react'

/*
 * Bilingual field group (CR-005 §4.2).
 *
 * Every master-data label is an English/Georgian pair. Rendered as two separate
 * form rows they double the height of an editor and read as unrelated fields;
 * grouped here they occupy one row with an EN / KA switch.
 *
 * Presentation only — both values stay in the caller's draft at all times, the
 * switch never touches them, and each input keeps the accessible name it had
 * before ("Name (English)", "Name (Georgian)") so nothing that identifies a
 * field by its label changes.
 */

export interface BilingualFieldProps {
  /** Full English-side label, e.g. "Name (English)". */
  labelEn: string
  /** Full Georgian-side label, e.g. "Name (Georgian)". */
  labelKa: string
  valueEn: string
  valueKa: string
  onChangeEn: (value: string) => void
  onChangeKa: (value: string) => void
  /** Marks the English side invalid; the Georgian side is always optional. */
  invalid?: boolean
  /** Renders a textarea instead of an input. */
  multiline?: boolean
  /** Helper text under the field. */
  help?: string
}

/**
 * The shared part of the pair's label.
 *
 * Both sides are written "<field> (<language>)" by convention, so dropping the
 * trailing parenthetical yields the caption. A label without one is used whole
 * rather than mangled.
 */
function captionOf(label: string): string {
  const open = label.lastIndexOf('(')
  if (open <= 0 || !label.trimEnd().endsWith(')')) return label
  return label.slice(0, open).trim()
}

export function BilingualField({
  labelEn,
  labelKa,
  valueEn,
  valueKa,
  onChangeEn,
  onChangeKa,
  invalid = false,
  multiline = false,
  help,
}: BilingualFieldProps) {
  const [side, setSide] = useState<'en' | 'ka'>('en')
  const captionId = useId()
  const helpId = useId()

  const active = side === 'en'
  const label = active ? labelEn : labelKa
  const value = active ? valueEn : valueKa
  const onChange = active ? onChangeEn : onChangeKa

  const controlProps = {
    value,
    'aria-label': label,
    'aria-invalid': active ? invalid : undefined,
    'aria-describedby': help ? helpId : undefined,
    onChange: (event: { target: { value: string } }) => {
      onChange(event.target.value)
    },
  }

  return (
    <div className="bilingual" role="group" aria-labelledby={captionId}>
      <div className="bilingual__head">
        <span className="bilingual__caption" id={captionId}>
          {captionOf(labelEn)}
        </span>
        <span className="bilingual__switch">
          {(['en', 'ka'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="bilingual__seg"
              aria-pressed={side === option}
              /*
               * Named by its visible EN / KA text, never by the field label —
               * an aria-label here would collide with the input's own name.
               * The group label and the title carry the field identity.
               */
              title={option === 'en' ? labelEn : labelKa}
              onClick={() => {
                setSide(option)
              }}
            >
              {option === 'en' ? 'EN' : 'KA'}
            </button>
          ))}
        </span>
      </div>

      {multiline ? (
        /*
         * Auto-grow: the row count follows the content so a long criterion is
         * readable without an inner scrollbar, capped so one field can never
         * push the rest of the form off screen.
         */
        <textarea
          className="bilingual__control"
          rows={Math.min(8, Math.max(2, value.split('\n').length, Math.ceil(value.length / 48)))}
          {...controlProps}
        />
      ) : (
        <input className="bilingual__control" {...controlProps} />
      )}

      {help ? (
        <small className="field__help" id={helpId}>
          {help}
        </small>
      ) : null}
    </div>
  )
}
