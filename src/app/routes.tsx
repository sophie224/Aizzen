import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  RequireAccess,
  RequireAdministration,
  RequireSuperAdministrator,
} from './guards/route-guards.tsx'
import { AdministrationPage } from '../features/administration/administration-page.tsx'
import { ControlRegisterPage } from '../features/controls/control-register-page.tsx'
import { DeficiencyRegisterPage } from '../features/controls/deficiency-register-page.tsx'
import { DashboardPage } from '../features/dashboards/dashboard-page.tsx'
import { PublicAboutPage } from '../features/public-site/about-page.tsx'
import { PublicHomePage } from '../features/public-site/home-page.tsx'
import { PublicRequestDemoPage } from '../features/public-site/request-demo-page.tsx'
import { ReportsPage } from '../features/reports/reports-page.tsx'
import { RegisterPage } from '../features/register/register-page.tsx'
import { RiskViewPage } from '../features/risk-view/risk-view-page.tsx'
import { SiteAdminPage } from '../features/site-admin/site-admin-page.tsx'
import { appConfig } from '../config/index.ts'
import { AppShell } from './layout/app-shell.tsx'
import { legacyAppTarget } from './legacy-app-path.ts'
import { LoadingState } from './pages/loading-state.tsx'
import { NotFoundPage } from './pages/placeholder.tsx'
import { SignInPage } from './pages/sign-in.tsx'
import { useCurrentUser } from './session/use-current-user.ts'

/*
 * Route table (ARCHITECTURE.md §8.1).
 *
 *   /                     public website — home
 *   /about                public website — about us
 *   /request-demo         public website — demo request form
 *   /dashboard            dashboard: read
 *   /register             register: read AND risks: read
 *   /risks/:id            record visibility (enforced per record in M9)
 *   /reports              reports: read
 *   /administration       Administrator / Super Administrator
 *   /admin/site           Super Administrator only
 *
 * The platform pages sit at the top level; `AppShell` wraps them through a
 * pathless layout route, so the shell is shared without owning a URL segment.
 * The former `/app/*` prefix is kept alive as a redirect only (see below).
 *
 * Each guarded element is wrapped at the route, so a direct URL is checked
 * exactly like a click through the navigation. The public pages take no guard
 * at all — they are the front door and require no session.
 */

/**
 * Unknown URL.
 *
 * A signed-in user gets the not-found page inside the shell; anyone else is
 * sent to the public home page rather than shown application chrome.
 */
function UnknownRoute() {
  const { user, ready } = useCurrentUser()

  if (!ready) return <LoadingState />
  if (!user) return <Navigate to="/" replace />

  return <NotFoundPage />
}

/**
 * Compatibility redirect for the retired `/app` prefix.
 *
 * Bookmarks, shared links and anything persisted before the flattening keep
 * working: the prefix is stripped and the query string and hash preserved.
 * Bare `/app` lands on the dashboard, as its index route used to.
 */
function LegacyAppRedirect() {
  const { pathname, search, hash } = useLocation()

  return <Navigate to={legacyAppTarget(pathname, search, hash)} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/about" element={<PublicAboutPage />} />
      <Route path="/request-demo" element={<PublicRequestDemoPage />} />
      <Route path="/login" element={<SignInPage />} />

      {/* Pathless layout route: shared shell, no `/app` segment in the URL. */}
      <Route element={<AppShell />}>
        <Route
          path="/dashboard"
          element={
            <RequireAccess module="dashboard">
              <DashboardPage />
            </RequireAccess>
          }
        />

        {/* The Register needs both register:read and risks:read. */}
        <Route
          path="/register"
          element={
            <RequireAccess module="register">
              <RequireAccess module="risks">
                <RegisterPage />
              </RequireAccess>
            </RequireAccess>
          }
        />

        {/*
          * Control Register and Control Deficiency Register (CR-2026).
          *
          * Registered only when the feature flag is on, so switching it off
          * removes the routes themselves — a direct URL 404s to the not-found
          * page rather than rendering a hidden module (SEC-12, QA-16).
          */}
        {appConfig.controlRegistersEnabled ? (
          <Route
            path="/controls"
            element={
              <RequireAccess module="controls">
                <ControlRegisterPage />
              </RequireAccess>
            }
          />
        ) : null}

        {appConfig.controlRegistersEnabled ? (
          <Route
            path="/control-deficiencies"
            element={
              <RequireAccess module="controls">
                <DeficiencyRegisterPage />
              </RequireAccess>
            }
          />
        ) : null}

        <Route
          path="/risks/:riskId"
          element={
            <RequireAccess module="risks">
              <RiskViewPage />
            </RequireAccess>
          }
        />

        <Route
          path="/reports"
          element={
            <RequireAccess module="reports">
              <ReportsPage />
            </RequireAccess>
          }
        />

        <Route
          path="/administration"
          element={
            <RequireAdministration>
              <AdministrationPage />
            </RequireAdministration>
          }
        />

        <Route path="*" element={<UnknownRoute />} />
      </Route>

      {/* Retired prefix — kept as a redirect so old links do not break. */}
      <Route path="/app" element={<LegacyAppRedirect />} />
      <Route path="/app/*" element={<LegacyAppRedirect />} />

      {/* Website Administration sits outside the module permission matrix. */}
      <Route
        path="/admin/site"
        element={
          <RequireSuperAdministrator>
            <AppShell />
          </RequireSuperAdministrator>
        }
      >
        <Route
          index
          element={
            <SiteAdminPage />
          }
        />
      </Route>
    </Routes>
  )
}
