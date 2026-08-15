import { describe, expect, it } from 'vitest'
import type { SavedView } from '../types/index.ts'
import {
  applySavedView,
  createSavedView,
  defaultViewFor,
  deleteSavedView,
  setDefaultView,
  viewsForUser,
  type SavedViewConfiguration,
} from './saved-views.ts'

/*
 * Saved views are PRIVATE to their owner and each owner holds at most one
 * default (ARCHITECTURE.md §8.2). Both rules are enforced here, in the pure
 * layer, so no UI can quietly break them.
 */

const CONFIGURATION: SavedViewConfiguration = {
  search: 'phishing',
  filters: { status: 'Monitoring' },
  sort: { field: 'residual', direction: 'desc' },
  visibleColumns: ['n', 'title', 'residual'],
  viewMode: 'compact',
}

function view(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: 'view_1',
    name: 'Monitoring',
    userId: 'usr_owner',
    search: '',
    filters: {},
    sort: { field: 'ref', direction: 'asc' },
    visibleColumns: ['n', 'title'],
    viewMode: 'detailed',
    isDefault: false,
    ...overrides,
  }
}

describe('ownership', () => {
  const views = [view(), view({ id: 'view_2', userId: 'usr_admin' })]

  it('returns only the owner’s views', () => {
    expect(viewsForUser(views, 'usr_owner').map((item) => item.id)).toEqual(['view_1'])
  })

  it('never deletes another user’s view', () => {
    expect(deleteSavedView(views, 'usr_owner', 'view_2')).toHaveLength(2)
  })

  it('never re-flags another user’s view as default', () => {
    const next = setDefaultView(views, 'usr_owner', 'view_2')
    expect(next.find((item) => item.id === 'view_2')?.isDefault).toBe(false)
  })
})

describe('creation', () => {
  it('captures the current configuration verbatim', () => {
    const [created] = createSavedView([], {
      id: 'view_new',
      userId: 'usr_owner',
      name: '  Top exposures  ',
      configuration: CONFIGURATION,
    })

    expect(created.name).toBe('Top exposures')
    expect(created.search).toBe('phishing')
    expect(created.filters).toEqual({ status: 'Monitoring' })
    expect(created.sort).toEqual({ field: 'residual', direction: 'desc' })
    expect(created.visibleColumns).toEqual(['n', 'title', 'residual'])
    expect(created.viewMode).toBe('compact')
  })

  it('copies the configuration rather than aliasing it', () => {
    const [created] = createSavedView([], {
      id: 'view_new',
      userId: 'usr_owner',
      name: 'Copy',
      configuration: CONFIGURATION,
    })

    expect(created.filters).not.toBe(CONFIGURATION.filters)
    expect(created.visibleColumns).not.toBe(CONFIGURATION.visibleColumns)
  })

  it('does not promote the first view to default on its own', () => {
    const [created] = createSavedView([], {
      id: 'view_new',
      userId: 'usr_owner',
      name: 'First',
      configuration: CONFIGURATION,
    })
    expect(created.isDefault).toBe(false)
  })
})

describe('default view', () => {
  it('marks one view and clears the previous default of the same user', () => {
    const views = [view({ id: 'a', isDefault: true }), view({ id: 'b' })]
    const next = setDefaultView(views, 'usr_owner', 'b')

    expect(next.find((item) => item.id === 'a')?.isDefault).toBe(false)
    expect(next.find((item) => item.id === 'b')?.isDefault).toBe(true)
  })

  it('clears the default when the current default is selected again', () => {
    const views = [view({ id: 'a', isDefault: true })]
    expect(setDefaultView(views, 'usr_owner', 'a')[0].isDefault).toBe(false)
  })

  it('reads back the owner’s default, and nobody else’s', () => {
    const views = [
      view({ id: 'a', userId: 'usr_admin', isDefault: true }),
      view({ id: 'b', userId: 'usr_owner' }),
    ]
    expect(defaultViewFor(views, 'usr_owner')).toBeNull()
    expect(defaultViewFor(views, 'usr_admin')?.id).toBe('a')
  })

  it('ignores an unknown view id', () => {
    const views = [view({ id: 'a', isDefault: true })]
    expect(setDefaultView(views, 'usr_owner', 'missing')).toEqual(views)
  })
})

describe('applying a view', () => {
  it('round-trips the stored configuration', () => {
    const [created] = createSavedView([], {
      id: 'view_new',
      userId: 'usr_owner',
      name: 'Round trip',
      configuration: CONFIGURATION,
    })

    expect(applySavedView(created)).toEqual(CONFIGURATION)
  })

  it('hands back copies, so editing the register cannot mutate the view', () => {
    const stored = view({ filters: { status: 'Monitoring' } })
    const applied = applySavedView(stored)

    applied.filters.status = 'Draft'

    expect(stored.filters.status).toBe('Monitoring')
    expect(applied.visibleColumns).not.toBe(stored.visibleColumns)
    expect(applied.sort).not.toBe(stored.sort)
  })
})
