import { BrowserRouter } from 'react-router-dom'
import { AppDataProvider } from './data/app-data-provider.tsx'
import { DocumentLanguage } from './app/layout/document-language.tsx'
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
        {/* Publishes the active language to <html lang> for a11y and :lang(). */}
        <DocumentLanguage />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionBootstrap>
    </AppDataProvider>
  )
}
