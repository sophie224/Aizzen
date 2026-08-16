import {
  maxStack,
  maxValue,
  stackTotal,
  type ChartData,
  type ChartPoint,
  type ChartSeries,
} from '../../domain/dashboard/series.ts'
import { LARGE_TEXT_TARGET, readableOn } from '../../domain/risk-engine/contrast.ts'
import type { ChartType } from '../../domain/types/index.ts'
import { resolveCssColor } from '../../ui/resolve-color.ts'

/*
 * The one chart renderer (CR-2026-014 §8, FR-01).
 *
 * The dashboard grid and the editor's live preview both render through this
 * component, so a preview can never drift from the saved result — the change
 * request forbids writing two renderers.
 *
 * Bars and columns are HTML, not SVG. They stretch to fill their widget, and a
 * stretched SVG stretches its text with it, so axis labels and values would
 * render distorted. Laid out with grid and flex they get native, crisp text at
 * any widget width. Line, area, pie and doughnut stay SVG, where the geometry
 * is the point.
 *
 * The product has no charting library and the design brief forbids adding a
 * runtime dependency, so all ten types are built from the platform. Every
 * colour arrives on the data; nothing about the palette is decided here.
 *
 * Meaning never rests on colour: every category is named, every value is
 * printed, and the whole series is restated as a table for assistive
 * technology.
 */

export interface WidgetChartProps {
  type: ChartType
  data: ChartData
  /** Names the chart for assistive technology. */
  label: string
  /** Formats a 0–1 share for the 100% variants. */
  percentLabel?: (value: number) => string
}

const VIEW_W = 320
const VIEW_H = 180
const PAD = 4

/** Below this share a segment is too small to hold its own digits. */
const LABEL_THRESHOLD = 0.12

function isBar(type: ChartType) {
  return type === 'bar' || type === 'barStacked' || type === 'barPct'
}

function isStacked(type: ChartType) {
  return type === 'columnStacked' || type === 'columnPct' || type === 'barStacked' || type === 'barPct'
}

function isPercent(type: ChartType) {
  return type === 'columnPct' || type === 'barPct'
}

function isRound(type: ChartType) {
  return type === 'pie' || type === 'doughnut'
}

/** Share of the axis one value occupies, 0–1. */
function fraction(point: ChartPoint, series: ChartSeries, data: ChartData, type: ChartType): number {
  const value = point.values[series.key] ?? 0
  if (isPercent(type)) {
    const total = stackTotal(point, data.series)
    return total === 0 ? 0 : value / total
  }
  const ceiling = isStacked(type) ? maxStack(data) : maxValue(data)
  return ceiling === 0 ? 0 : value / ceiling
}

/* --- bars and columns, in HTML ---------------------------------------------- */

function Bars({
  type,
  data,
  percentLabel,
}: {
  type: ChartType
  data: ChartData
  percentLabel?: (value: number) => string
}) {
  const bar = isBar(type)
  const stacked = isStacked(type)
  const percent = isPercent(type)

  /** What to print inside a segment, or null when it would not fit. */
  const segmentLabel = (point: ChartPoint, series: ChartSeries, share: number) => {
    const value = point.values[series.key] ?? 0
    if (value === 0 || share < LABEL_THRESHOLD) return null
    if (percent) {
      const total = stackTotal(point, data.series)
      return percentLabel ? percentLabel(total === 0 ? 0 : value / total) : String(value)
    }
    return String(value)
  }

  return (
    <div className={`chart-bars chart-bars--${bar ? 'horizontal' : 'vertical'}`}>
      {data.points.map((point) => {
        const total = stackTotal(point, data.series)

        return (
          <div key={point.key} className="chart-bars__entry">
            {/* The category axis. Named, always — never a bare bar. */}
            <span className="chart-bars__label" title={point.name}>
              {point.name}
            </span>

            <div
              className={
                stacked ? 'chart-bars__track chart-bars__track--stacked' : 'chart-bars__track'
              }
            >
              {data.series.map((series) => {
                const share = fraction(point, series, data, type)
                if (share <= 0) return null
                const text = segmentLabel(point, series, share)

                return (
                  <span
                    key={series.key}
                    className="chart-bars__segment"
                    style={{
                      [bar ? 'inlineSize' : 'blockSize']: `${String(share * 100)}%`,
                      background: series.color,
                    }}
                    title={`${series.label}: ${String(point.values[series.key] ?? 0)}`}
                  >
                    {text ? (
                      /*
                       * The label sits on an administrator-chosen fill, so its
                       * colour is COMPUTED against that fill rather than fixed
                       * — white on the configured yellow is unreadable.
                       */
                      <span
                        className="chart-bars__value"
                        style={{ color: readableOn(resolveCssColor(series.color), LARGE_TEXT_TARGET) }}
                      >
                        {text}
                      </span>
                    ) : null}
                  </span>
                )
              })}
            </div>

            {/* The category total, so a number is always on screen. */}
            <span className="chart-bars__total">{percent ? '100%' : total}</span>
          </div>
        )
      })}
    </div>
  )
}

/* --- line and area ---------------------------------------------------------- */

function Lines({ type, data }: { type: ChartType; data: ChartData }) {
  const step = VIEW_W / Math.max(1, data.points.length - 1 || 1)
  const ceiling = maxValue(data)

  return (
    <>
      <svg
        className="chart-line"
        viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {data.series.map((series) => {
          const points = data.points.map((point, index) => {
            const value = point.values[series.key] ?? 0
            return {
              x: data.points.length === 1 ? VIEW_W / 2 : index * step,
              y: VIEW_H - (value / ceiling) * (VIEW_H - PAD),
            }
          })
          const path = points
            .map((p, index) => `${index === 0 ? 'M' : 'L'}${String(p.x)} ${String(p.y)}`)
            .join(' ')

          return (
            <g key={series.key}>
              {type === 'area' ? (
                <path
                  d={`${path} L${String(points.at(-1)?.x ?? 0)} ${String(VIEW_H)} L${String(points[0]?.x ?? 0)} ${String(VIEW_H)} Z`}
                  fill={series.color}
                  opacity="0.18"
                />
              ) : null}
              <path d={path} fill="none" stroke={series.color} strokeWidth="2.5" />
              {points.map((p, index) => (
                <circle key={index} cx={p.x} cy={p.y} r="3" fill={series.color} />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Category axis in HTML, so it is not stretched with the plot. */}
      <div className="chart-axis">
        {data.points.map((point) => (
          <span key={point.key} className="chart-axis__tick" title={point.name}>
            {point.name}
            <strong>{stackTotal(point, data.series)}</strong>
          </span>
        ))}
      </div>
    </>
  )
}

/* --- pie and doughnut ------------------------------------------------------- */

/**
 * One slice per category, plotting the first series. The colour control moves
 * from per-series to per-slice to match (FR-01, FR-04).
 */
function Round({ type, data }: { type: ChartType; data: ChartData }) {
  const series = data.series[0]
  if (!series) return null

  const total = data.points.reduce((sum, point) => sum + (point.values[series.key] ?? 0), 0)
  if (total === 0) return null

  const cx = VIEW_W / 2
  const cy = VIEW_H / 2
  const r = Math.min(VIEW_W, VIEW_H) / 2 - PAD
  const inner = type === 'doughnut' ? r * 0.58 : 0

  // Every slice's start angle, resolved before anything is drawn.
  const values = data.points.map((point) => point.values[series.key] ?? 0)
  const starts = values.map(
    (_, at) =>
      -Math.PI / 2 +
      (values.slice(0, at).reduce((sum, value) => sum + value, 0) / total) * Math.PI * 2,
  )

  return (
    <svg
      className="chart-round"
      viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {data.points.map((point, index) => {
        const value = values[index]
        if (value === 0) return null
        const angle = starts[index]
        const sweep = (value / total) * Math.PI * 2
        const end = angle + sweep
        const large = sweep > Math.PI ? 1 : 0

        const p = (radius: number, at: number) =>
          `${String(cx + radius * Math.cos(at))} ${String(cy + radius * Math.sin(at))}`

        const d =
          inner > 0
            ? `M${p(r, angle)} A${String(r)} ${String(r)} 0 ${String(large)} 1 ${p(r, end)} L${p(inner, end)} A${String(inner)} ${String(inner)} 0 ${String(large)} 0 ${p(inner, angle)} Z`
            : `M${String(cx)} ${String(cy)} L${p(r, angle)} A${String(r)} ${String(r)} 0 ${String(large)} 1 ${p(r, end)} Z`

        return <path key={point.key} d={d} fill={point.color ?? series.color} />
      })}
    </svg>
  )
}

export function WidgetChart({ type, data, label, percentLabel }: WidgetChartProps) {
  const round = isRound(type)
  const first = data.series[0]

  /*
   * Pie and doughnut are read from the legend, so each entry carries its own
   * count there. Every other type prints its values on the plot itself.
   */
  const legend = round
    ? data.points.map((point) => ({
        key: point.key,
        label: point.name,
        color: point.color ?? '',
        value: first ? (point.values[first.key] ?? 0) : 0,
      }))
    : data.series.map((series) => ({
        key: series.key,
        label: series.label,
        color: series.color,
        value: null as number | null,
      }))

  return (
    <figure className="widget-chart" aria-label={label}>
      {round ? (
        <Round type={type} data={data} />
      ) : type === 'line' || type === 'area' ? (
        <Lines type={type} data={data} />
      ) : (
        <Bars type={type} data={data} percentLabel={percentLabel} />
      )}

      {/* Colour alone never carries meaning — every series is named. */}
      <ul className="widget-chart__legend">
        {legend.map((entry) => (
          <li key={entry.key}>
            <span
              className="widget-chart__swatch"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            {entry.label}
            {entry.value === null ? null : <strong>{entry.value}</strong>}
          </li>
        ))}
      </ul>

      {/* The same numbers as a table, so the chart is never the only source. */}
      <table className="visually-hidden">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            {data.series.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.name}</th>
              {data.series.map((series) => {
                const value = point.values[series.key] ?? 0
                const total = stackTotal(point, data.series)
                return (
                  <td key={series.key}>
                    {isPercent(type) && percentLabel
                      ? percentLabel(total === 0 ? 0 : value / total)
                      : value}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
