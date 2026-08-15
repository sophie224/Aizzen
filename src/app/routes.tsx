import { Navigate, Route, Routes } from 'react-router-dom'
import {
  RequireAccess,
  RequireAdministration,
  RequireSuperAdministrator,
} from './guards/route-guards.tsx'
import { AdministrationPage } from '../features/administration/administration-page.tsx'
import { DashboardPage } from '../features/dashboards/dashboard-page.tsx'
import { PublicAboutPage } from '../features/public-site/about-page.tsx'
import { PublicHomePage } from '../features/public-site/home-page.tsx'
import { ReportsPage } from '../features/reports/reports-page.tsx'
import { RegisterPage } from '../features/register/register-page.tsx'
import { RiskViewPage } from '../features/risk-view/risk-view-page.tsx'
import { SiteAdminPage } from '../features/site-admin/site-admin-page.tsx'
import { AppShell } from './layout/app-shell.tsx'
import { NotFoundPage } from './pages/placeholder.tsx'
import { SignInPage } from './pages/sign-in.tsx'

/*
 * Route table (ARCHITECTURE.md §8.1).
 *
 *   /                     public website — home
 *   /about                public website — about us
 *   /app/dashboard        dashboard: read
 *   /app/register         register: read AND risks: read
 *   /app/risks/:id        record visibility (enforced per record in M9)
 *   /app/reports          reports: read
 *   /app/administration   Administrator / Super Administrator
 *   /admin/site           Super Administrator only
 *
 * Each guarded element is wrapped at the route, so a direct URL is checked
 * exactly like a click through the navigation. The public pages take no guard
 * at all — they are the front door and require no session.
 */

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/about" element={<PublicAboutPage />} />
      <Route path="/login" element={<SignInPage />} />

      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />

        <Route
          path="dashboard"
          element={
            <RequireAccess module="dashboard">
              <DashboardPage />
            </RequireAccess>
          }
        />

        {/* The Register needs both register:read and risks:read. */}
        <Route
          path="register"
          element={
            <RequireAccess module="register">
              <RequireAccess module="risks">
                <RegisterPage />
              </RequireAccess>
            </RequireAccess>
          }
        />

        <Route
          path="risks/:riskId"
          element={
            <RequireAccess module="risks">
              <RiskViewPage />
            </RequireAccess>
          }
        />

        <Route
          path="reports"
          element={
            <RequireAccess module="reports">
              <ReportsPage />
            </RequireAccess>
          }
        />

        <Route
          path="administration"
          element={
            <RequireAdministration>
              <AdministrationPage />
            </RequireAdministration>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
