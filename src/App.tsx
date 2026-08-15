import { BrowserRouter } from 'react-router-dom'
import { AppDataProvider } from './data/app-data-provider.tsx'
import { AppRoutes } from './app/routes.tsx'
import { SessionBootstrap } from './app/session/session-bootstrap.tsx'

/**
 * Application root: data provider, session restore, router, routes.
 *
 * Order matters. `AppDataProvider` sits outermost because `SessionBootstrap`
 * resolves the persisted user against AppState, and the guards inside
 * `AppRoutes` need both settled before they decide.
 */
export default function App() {
  return (
    <AppDataProvider>
      <SessionBootstrap>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionBootstrap>
    </AppDataProvider>
  )
}
