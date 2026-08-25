import { Link } from 'react-router-dom'
import { useAppData } from '../../data/app-data-context.ts'
import { linkedControls, riskViewCustomColumns } from '../../domain/controls/index.ts'
import { appConfig } from '../../config/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { ScaleChip } from './scale-chip.tsx'
import './controls.css'

/*
 * Linked controls on the Individual Risk View (CR-2026 §6, change 2).
 *
 * READ-ONLY and additive. Effectiveness and Assurance are read from the
 * control itself, so changing a control's rating in the register is visible on
 * every risk linked to it without touching the risk (FR-CR-05, QA-07). Custom
 * columns appear here only when an administrator ticked "show in the risk
 * linked-controls view" (FR-CR-11, QA-10).
 *
 * Renders nothing when the feature flag is off or nothing is linked, so the
 * existing risk view is unchanged for anyone not using the register (QA-16).
 */

export interface LinkedControlsPanelProps {
  riskId: string
}

export function LinkedControlsPanel({ riskId }: LinkedControlsPanelProps) {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const { context } = useCurrentUser()

  if (!state || !appConfig.controlRegistersEnabled) return null

  const controls = linkedControls(context, state, riskId)
  if (controls.length === 0) return null

  const extraColumns = riskViewCustomColumns(state.controlConfig)

  return (
    <section className="panel" aria-labelledby="linked-controls-panel-title">
      <header className="panel__head">
        <h2 id="linked-controls-panel-title">{t('controls.risk.linked')}</h2>
        <p className="panel__meta">{t('controls.risk.linkedNote')}</p>
      </header>

      <div className="scroll-x">
        <table className="control-table">
          <thead>
            <tr>
              <th scope="col">{t('controls.column.ref')}</th>
              <th scope="col">{t('controls.column.name')}</th>
              <th scope="col">{t('controls.column.effectiveness')}</th>
              <th scope="col">{t('controls.column.assurance')}</th>
              {extraColumns.map((column) => (
                <th scope="col" key={column.id}>
                  {pickLanguage(column.labelEn, column.labelKa, language)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {controls.map((control) => (
              <tr key={control.id}>
                <td>
                  <Link to="/controls" className="code">
                    {control.ref}
                  </Link>
                </td>
                <td>{control.name}</td>
                <td>
                  <ScaleChip
                    config={state.controlConfig}
                    scale="effectiveness"
                    value={control.effectiveness}
                    language={language}
                  />
                </td>
                <td>
                  <ScaleChip
                    config={state.controlConfig}
                    scale="assurance"
                    value={control.assurance}
                    language={language}
                  />
                </td>
                {extraColumns.map((column) => {
                  const raw = control.custom[column.id]
                  return <td key={column.id}>{raw === undefined || raw === '' ? '—' : String(raw)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
