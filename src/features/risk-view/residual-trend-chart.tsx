import { riskScore } from '../../domain/risk-engine/index.ts'
import type { AssessmentHistoryItem } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'

/*
 * Residual score over time (ARCHITECTURE.md §8.2).
 *
 * Inline SVG rather than a charting dependency: the series is at most a
 * handful of points, and the accessible table below carries the same data so
 * the chart is never the only way to read it.
 */

export interface ResidualTrendChartProps {
  history: readonly AssessmentHistoryItem[]
}

const WIDTH = 480
const HEIGHT = 140
const PADDING = 24
/** Scores run 1–25, so the axis is fixed rather than data-driven. */
const MAX_SCORE = 25

export function ResidualTrendChart({ history }: ResidualTrendChartProps) {
  const { t } = useTranslation()

  if (history.length === 0) {
    return <p className="panel__meta">{t('view.assessment.noHistory')}</p>
  }

  const points = history.map((item, index) => {
    const score = riskScore(item.residual)
    const x =
      history.length === 1
        ? WIDTH / 2
        : PADDING + (index / (history.length - 1)) * (WIDTH - PADDING * 2)
    const y = HEIGHT - PADDING - (score / MAX_SCORE) * (HEIGHT - PADDING * 2)
    return { x, y, score, date: item.date }
  })

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')

  return (
    <figure className="trend-chart">
      <figcaption className="visually-hidden">{t('view.assessment.residualTrend')}</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${t('view.assessment.residualTrend')}: ${points.map((p) => `${p.date} ${String(p.score)}`).join(', ')}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Faint gridlines at quarter intervals of the 1–25 range. */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = HEIGHT - PADDING - fraction * (HEIGHT - PADDING * 2)
          return (
            <line
              key={fraction}
              x1={PADDING}
              x2={WIDTH - PADDING}
              y1={y}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
          )
        })}

        {points.length > 1 ? (
          <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" />
        ) : null}

        {points.map((point, index) => (
          <circle
            key={`${point.date}-${String(index)}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 6 : 4}
            fill="var(--color-primary)"
          />
        ))}
      </svg>

      {/* Same series as a table, so the data is never chart-only. */}
      <table className="trend-chart__data">
        <caption className="visually-hidden">{t('view.assessment.residualTrend')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('view.assessment.date')}</th>
            <th scope="col">{t('register.column.residual')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.date}-row-${String(index)}`}>
              <td>{point.date}</td>
              <td>{point.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
