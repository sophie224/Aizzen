import type {
  AssessmentType,
  DashboardLayout,
  DashboardView,
  RiskFilters,
} from '../types/index.ts'

/*
 * Saved Dashboard views and per-user widget layout (CR-004).
 *
 * Deliberately the same shape of rules as the Register's saved views: private
 * to their owner, at most one default each, and pure list transforms with no
 * storage or React in sight.
 */

/** The fixed widget set. Order here is the default arrangement. */
export const DASHBOARD_WIDGETS = [
  'kpis',
  'heatmap',
  'byBusinessUnit',
  'byStatus',
  'byCategory',
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]

export function viewsForUser(views: readonly DashboardView[], userId: string): DashboardView[] {
  return views.filter((view) => view.userId === userId)
}

export function defaultViewFor(
  views: readonly DashboardView[],
  userId: string,
): DashboardView | null {
  return views.find((view) => view.userId === userId && view.isDefault) ?? null
}

export function createDashboardView(
  views: readonly DashboardView[],
  input: {
    id: string
    userId: string
    name: string
    filters: RiskFilters
    basis: AssessmentType
  },
): DashboardView[] {
  return [
    ...views,
    {
      id: input.id,
      name: input.name.trim(),
      userId: input.userId,
      filters: { ...input.filters },
      basis: input.basis,
      // Making one the default is an explicit act, never a side effect.
      isDefault: false,
    },
  ]
}

/** Marks one view as the owner's default; selecting the current one clears it. */
export function setDefaultDashboardView(
  views: readonly DashboardView[],
  userId: string,
  viewId: string,
): DashboardView[] {
  const target = views.find((view) => view.id === viewId && view.userId === userId)
  if (!target) return [...views]

  const nextValue = !target.isDefault
  return views.map((view) => {
    if (view.userId !== userId) return view
    if (view.id === viewId) return { ...view, isDefault: nextValue }
    return view.isDefault ? { ...view, isDefault: false } : view
  })
}

export function deleteDashboardView(
  views: readonly DashboardView[],
  userId: string,
  viewId: string,
): DashboardView[] {
  return views.filter((view) => !(view.id === viewId && view.userId === userId))
}

// --- widget layout -----------------------------------------------------------

/**
 * The user's arrangement, reconciled against the widget set that actually
 * exists: unknown IDs are dropped and new widgets appear at the end, so
 * shipping a widget never leaves a saved layout broken.
 */
export function resolveLayout(
  layouts: readonly DashboardLayout[],
  userId: string,
): { order: DashboardWidgetId[]; hidden: DashboardWidgetId[] } {
  const stored = layouts.find((layout) => layout.userId === userId)
  const known = new Set<string>(DASHBOARD_WIDGETS)

  const order = (stored?.order ?? []).filter((id): id is DashboardWidgetId => known.has(id))
  for (const id of DASHBOARD_WIDGETS) {
    if (!order.includes(id)) order.push(id)
  }

  const hidden = (stored?.hidden ?? []).filter((id): id is DashboardWidgetId => known.has(id))
  return { order, hidden }
}

/** Moves one widget by `delta` positions, clamped to the ends. */
export function moveWidget(
  order: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
  delta: number,
): DashboardWidgetId[] {
  const from = order.indexOf(id)
  if (from < 0) return [...order]

  const to = Math.min(order.length - 1, Math.max(0, from + delta))
  if (to === from) return [...order]

  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

export function toggleWidget(
  hidden: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
): DashboardWidgetId[] {
  return hidden.includes(id) ? hidden.filter((candidate) => candidate !== id) : [...hidden, id]
}

/** Writes one user's layout, replacing any previous entry. */
export function saveLayout(
  layouts: readonly DashboardLayout[],
  userId: string,
  next: { order: readonly DashboardWidgetId[]; hidden: readonly DashboardWidgetId[] },
): DashboardLayout[] {
  const others = layouts.filter((layout) => layout.userId !== userId)
  return [...others, { userId, order: [...next.order], hidden: [...next.hidden] }]
}
