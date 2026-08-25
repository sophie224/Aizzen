import { useMemo, useState } from 'react'
import { useAppData } from '../../data/app-data-context.ts'
import { searchControls, visibleControls } from '../../domain/controls/index.ts'
import { appConfig } from '../../config/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { ScaleChip } from './scale-chip.tsx'
import './controls.css'

/*
 * "Linked controls" selector for the risk editor (CR-2026 §6, change 1).
 *
 * ADDITIVE by design: it edits a selection held by the caller and writes
 * nothing itself. The risk still saves with no controls linked, and no
 * existing validation, field or payload changes — the links are written to
 * their own collection after the risk itself has been saved.
 *
 * Candidates are the user's VISIBLE controls, so the picker cannot be used to
 * discover or attach a control from another organisational unit (SEC-01).
 */

export interface LinkedControlsPickerProps {
  selectedIds: string[]
  onChange: (controlIds: string[]) => void
}

export function LinkedControlsPicker({ selectedIds, onChange }: LinkedControlsPickerProps) {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const { context } = useCurrentUser()
  const [term, setTerm] = useState('')

  const reachable = useMemo(
    () => (state ? visibleControls(context, state.controls) : []),
    [state, context],
  )
  const matches = useMemo(() => searchControls(reachable, term, 25), [reachable, term])

  if (!state || !appConfig.controlRegistersEnabled) return null

  const selected = reachable.filter((control) => selectedIds.includes(control.id))

  const toggle = (controlId: string, checked: boolean) => {
    onChange(
      checked
        ? [...new Set([...selectedIds, controlId])]
        : selectedIds.filter((id) => id !== controlId),
    )
  }

  return (
    <section className="editor-section linked-controls__picker" aria-labelledby="linked-controls-title">
      <header className="editor-section__head">
        <h3 id="linked-controls-title">{t('controls.risk.linked')}</h3>
        <p>{t('controls.risk.optional')}</p>
      </header>

      {selected.length > 0 ? (
        <ul className="linked-controls">
          {selected.map((control) => (
            <li key={control.id} className="linked-controls__row">
              <span className="code">{control.ref}</span>
              <span className="linked-controls__name">{control.name}</span>
              <ScaleChip
                config={state.controlConfig}
                scale="effectiveness"
                value={control.effectiveness}
                language={language}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  toggle(control.id, false)
                }}
              >
                {t('controls.risk.unlink')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__meta">{t('controls.risk.none')}</p>
      )}

      <label className="editor-field">
        <span>{t('controls.risk.link')}</span>
        <input
          type="search"
          value={term}
          placeholder={t('deficiency.editor.controlSearch')}
          onChange={(event) => {
            setTerm(event.target.value)
          }}
        />
      </label>

      <ul className="linked-controls__options">
        {matches.map((control) => (
          <li key={control.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedIds.includes(control.id)}
                onChange={(event) => {
                  toggle(control.id, event.target.checked)
                }}
              />
              <span className="code">{control.ref}</span> {control.name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
