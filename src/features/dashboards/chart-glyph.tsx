import type { ChartType } from '../../domain/types/index.ts'

/*
 * Preview glyph for the chart type picker (CR-2026-014 FR-01).
 *
 * A miniature of the shape the option produces, so the grid reads the way the
 * reference deck's picker does. Decorative only — every option carries its
 * name as text beside the glyph, so the choice never rests on the picture.
 */

const BARS: Record<string, { x: number; y: number; w: number; h: number; tone: number }[]> = {
  column: [
    { x: 1, y: 6, w: 3, h: 8, tone: 1 }, { x: 5, y: 3, w: 3, h: 11, tone: 2 },
    { x: 10, y: 8, w: 3, h: 6, tone: 1 }, { x: 14, y: 5, w: 3, h: 9, tone: 2 },
  ],
  columnStacked: [
    { x: 2, y: 8, w: 5, h: 6, tone: 1 }, { x: 2, y: 4, w: 5, h: 4, tone: 2 },
    { x: 11, y: 6, w: 5, h: 8, tone: 1 }, { x: 11, y: 2, w: 5, h: 4, tone: 2 },
  ],
  columnPct: [
    { x: 2, y: 7, w: 5, h: 7, tone: 1 }, { x: 2, y: 2, w: 5, h: 5, tone: 2 },
    { x: 11, y: 5, w: 5, h: 9, tone: 1 }, { x: 11, y: 2, w: 5, h: 3, tone: 2 },
  ],
  bar: [
    { x: 2, y: 1, w: 8, h: 3, tone: 1 }, { x: 2, y: 5, w: 12, h: 3, tone: 2 },
    { x: 2, y: 9, w: 6, h: 3, tone: 1 },
  ],
  barStacked: [
    { x: 2, y: 2, w: 6, h: 4, tone: 1 }, { x: 8, y: 2, w: 5, h: 4, tone: 2 },
    { x: 2, y: 8, w: 8, h: 4, tone: 1 }, { x: 10, y: 8, w: 4, h: 4, tone: 2 },
  ],
  barPct: [
    { x: 2, y: 2, w: 9, h: 4, tone: 1 }, { x: 11, y: 2, w: 5, h: 4, tone: 2 },
    { x: 2, y: 8, w: 6, h: 4, tone: 1 }, { x: 8, y: 8, w: 8, h: 4, tone: 2 },
  ],
}

/** Bar-list glyph, for the widget's original horizontal list rendering. */
const LIST = BARS.bar

export function ChartGlyph({ type }: { type: ChartType | null }) {
  const rects = type === null ? LIST : BARS[type]

  return (
    <svg className="chart-glyph" viewBox="0 0 18 16" aria-hidden="true" focusable="false">
      {rects
        ? rects.map((bar, index) => (
            <rect
              key={index}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              rx="0.5"
              className={`chart-glyph__bar chart-glyph__bar--${String(bar.tone)}`}
            />
          ))
        : null}

      {type === 'line' || type === 'area' ? (
        <>
          {type === 'area' ? (
            <path d="M2 11 L7 6 L11 9 L16 3 L16 14 L2 14 Z" className="chart-glyph__area" />
          ) : null}
          <path d="M2 11 L7 6 L11 9 L16 3" className="chart-glyph__line" fill="none" />
        </>
      ) : null}

      {type === 'pie' || type === 'doughnut' ? (
        <>
          <circle cx="9" cy="8" r="6" className="chart-glyph__bar chart-glyph__bar--1" />
          <path d="M9 8 L9 2 A6 6 0 0 1 14.2 11 Z" className="chart-glyph__bar chart-glyph__bar--2" />
          {type === 'doughnut' ? <circle cx="9" cy="8" r="2.6" className="chart-glyph__hole" /> : null}
        </>
      ) : null}
    </svg>
  )
}
