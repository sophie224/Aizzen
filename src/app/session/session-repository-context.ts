import { createContext, useContext } from 'react'
import {
  LocalSessionRepository,
  type SessionRepository,
} from '../../data/session-repository.ts'

/*
 * Makes the session store injectable so tests can supply an in-memory
 * implementation instead of touching browser storage.
 */

const defaultRepository = new LocalSessionRepository()

export const SessionRepositoryContext = createContext<SessionRepository>(defaultRepository)

export function useSessionRepository(): SessionRepository {
  return useContext(SessionRepositoryContext)
}
