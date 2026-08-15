import type { RegisterViewMode, RiskFilters, SavedView, SortState } from '../types/index.ts'

/*
 * Saved Register views (ARCHITECTURE.md §8.2).
 *
 * Pure list transforms — no React, no storage. A saved view is PRIVATE to the
 * user who created it, and each user may hold at most one default. Setting a
 * default therefore clears the previous default of that user only; another
 * user's default is never touched.
 */

/** The configuration a saved view captures. */
export interface SavedViewConfiguration {
  search: string
  filters: RiskFilters
  sort: SortState
  visibleColumns: readonly string[]
  viewMode: RegisterViewMode
}

/** Only the owner's views, in creation order. */
export function viewsForUser(views: readonly SavedView[], userId: string): SavedView[] {
  return views.filter((view) => view.userId === userId)
}

/** The owner's default view, or null when none is marked. */
export function defaultViewFor(views: readonly SavedView[], userId: string): SavedView | null {
  return views.find((view) => view.userId === userId && view.isDefault) ?? null
}

/**
 * Appends a view for `userId`.
 *
 * A first view is not silently promoted to default: making one the default is
 * an explicit act (the star control), so the page-open behaviour is never a
 * surprise.
 */
export function createSavedView(
  views: readonly SavedView[],
  input: { id: string; userId: string; name: string; configuration: SavedViewConfiguration },
): SavedView[] {
  const view: SavedView = {
    id: input.id,
    name: input.name.trim(),
    userId: input.userId,
    search: input.configuration.search,
    filters: { ...input.configuration.filters },
    sort: { ...input.configuration.sort },
    visibleColumns: [...input.configuration.visibleColumns],
    viewMode: input.configuration.viewMode,
    isDefault: false,
  }
  return [...views, view]
}

/**
 * Marks one view as the owner's default, clearing any previous default of the
 * SAME user. Re-selecting the current default clears it, so a user can return
 * to "no default view".
 */
export function setDefaultView(
  views: readonly SavedView[],
  userId: string,
  viewId: string,
): SavedView[] {
  const target = views.find((view) => view.id === viewId && view.userId === userId)
  if (!target) return [...views]

  const nextValue = !target.isDefault

  return views.map((view) => {
    if (view.userId !== userId) return view
    if (view.id === viewId) return { ...view, isDefault: nextValue }
    return view.isDefault ? { ...view, isDefault: false } : view
  })
}

/** Removes one of the owner's views. Another user's view is never removed. */
export function deleteSavedView(
  views: readonly SavedView[],
  userId: string,
  viewId: string,
): SavedView[] {
  return views.filter((view) => !(view.id === viewId && view.userId === userId))
}

/** Reads a saved view back into the Register's working configuration. */
export function applySavedView(view: SavedView): SavedViewConfiguration {
  return {
    search: view.search,
    filters: { ...view.filters },
    sort: { ...view.sort },
    visibleColumns: [...view.visibleColumns],
    viewMode: view.viewMode,
  }
}
