import { useCallback, useMemo } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  availableColumns,
  moveColumn,
  orderedColumns,
  type ControlColumnDefinition,
} from '../../domain/controls/index.ts'
import type { ControlRegisterName, Language } from '../../domain/types/index.ts'

/*
 * Per-user column order for a register (FR-CR-07, FR-CD-05).
 *
 * The preference is business data with a user id on it, so it lives in
 * AppState behind the same transaction as everything else rather than in
 * browser storage. Losing it can never block rendering: the order is
 * reconciled against the columns that exist right now, and an unknown id is
 * simply dropped.
 */

export interface ColumnOrder {
  columns: ControlColumnDefinition[]
  move: (columnId: string, targetId: string) => Promise<void>
  reset: () => Promise<void>
  reordered: boolean
}

export function useColumnOrder(
  register: ControlRegisterName,
  userId: string | null,
  language: Language,
): ColumnOrder {
  const { state } = useAppData()
  const store = useAppDataStore()

  const definitions = useMemo(
    () => (state ? availableColumns(state.controlConfig, register, language) : []),
    [state, register, language],
  )

  const order = useMemo(() => {
    if (!state || !userId) return definitions.map((column) => column.id)
    return orderedColumns(
      state.controlColumnPreferences,
      userId,
      register,
      definitions.map((column) => column.id),
    )
  }, [state, userId, register, definitions])

  const columns = useMemo(
    () =>
      order
        .map((id) => definitions.find((column) => column.id === id))
        .filter((column): column is ControlColumnDefinition => column !== undefined),
    [order, definitions],
  )

  const save = useCallback(
    async (columnIds: string[]) => {
      if (!userId) return
      await store.update({
        mutate: (next) => {
          const existing = next.controlColumnPreferences.find(
            (preference) => preference.userId === userId && preference.register === register,
          )
          if (existing) existing.columnIds = columnIds
          else
            next.controlColumnPreferences.push({
              id: `ccp_${userId}_${register}`,
              userId,
              register,
              columnIds,
            })
        },
        // A layout preference is not a business event; the audit trail stays
        // about controls, findings and links.
      })
    },
    [store, userId, register],
  )

  const move = useCallback(
    async (columnId: string, targetId: string) => {
      await save(moveColumn(order, columnId, targetId))
    },
    [order, save],
  )

  const reset = useCallback(async () => {
    await save(definitions.map((column) => column.id))
  }, [definitions, save])

  const reordered = useMemo(
    () => order.join('|') !== definitions.map((column) => column.id).join('|'),
    [order, definitions],
  )

  return { columns, move, reset, reordered }
}
