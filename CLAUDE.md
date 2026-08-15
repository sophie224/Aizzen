# CLAUDE.md — Aizzen Risk Management Platform

Guidance for Claude Code working in this repository. Read `ARCHITECTURE.md` for the system design and `PLAN.md` for the milestone order before making non-trivial changes.

---

## Project

Aizzen Risk Management (RM) web platform: a bilingual (ქართული / English) Enterprise Risk Management SPA for a risk register, inherent/residual/target assessment, controls, remediation actions, acceptance, dashboards and reports, plus an OU-style Administration module and a public-site CMS.

The work in progress is a **refactor**: `app.html` (a single 2.5 MB file, React via `React.createElement`, `schemaVersion: 7`) is being reorganised into a modular React + TypeScript SPA under `src/`, with a Phase 2 backend cutover path.

**Spec:** `docs/RM_Platform.pdf` — 74 pages: PRD (pp. 1–7) + as-built addendum manuals (pp. 8–74).

**Precedence:** when the PRD conflicts with the addendum, **the PRD wins** — the spec states this explicitly. Within the addendum: Risk Rating Matrix 2026 → ERM Framework v1.0 → Risk Category Library 2026 → LEG-POL-001 → Change Requests → AIZEN 4.1.0 as-built code.

---

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Build | **Vite 8** | `vite.config.ts`, `@vitejs/plugin-react` |
| Framework | **React 19.2** | function components + hooks |
| Language | **TypeScript ~6.0** | strict-ish; `tsc -b && vite build` |
| Lint | **ESLint 10 flat config** | `eslint.config.js` with `typescript-eslint`, `react-hooks`, `react-refresh` |
| Module system | ESM (`"type": "module"`) | `verbatimModuleSyntax`, `moduleResolution: bundler` |
| Target | `es2023`, DOM | `jsx: react-jsx` |

**Not yet installed but implied by the architecture** — add deliberately in M1, do not assume they exist: router, session/UI store (Zustand-style), server-state/query layer, Vitest + Testing Library, Playwright.

### Scripts

```
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # vite preview
```

### Compiler flags already enforced

`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `allowImportingTsExtensions`, `verbatimModuleSyntax`. Write code that satisfies these on the first pass — don't leave unused imports or parameters behind.

---

## Layer boundaries (enforce these)

```
Routes / Pages
  → Feature components
    → AppDataContext (authoritative AppState + the single mutation transaction)
      → Domain layer (pure: risk engine, permissions, BU tree, validators, i18n)
        → AppRepository interface
          → LocalStorageRepository | ApiRepository (on-prem) | ApiRepository (AWS)
```

| Rule | Why |
|---|---|
| **Never call `localStorage` outside the storage adapter.** | The PRD requires a backend-portable data model with no logic hard-coded to localStorage. |
| **Never duplicate rating logic in a UI component.** | The spec prohibits it by name; all chips, cards, heatmaps, filters, reports and exports must call the one risk engine. |
| **The domain layer imports no React and performs no I/O.** | It must stay unit-testable and reusable server-side in Phase 2. |
| **Business data lives in `AppState`; the UI store holds only session/UI state.** | Zustand-style state is not authoritative business data. |
| **Never store a derived value.** | Score, rating, trend, direction to target, effective scope, overdue flag and dashboard metrics are recomputed at runtime so a config change propagates everywhere. |

### The one mutation path

```
read AppState → deep-clone → apply deterministic mutator
  → append history (only if a score changed) + audit event
  → repository.save(next) → publish to UI
```

A component writing storage directly is a defect. In Phase 2 the same sequence becomes a server transaction — entity write + history + audit commit together, and a failed audit insert rolls the mutation back.

---

## Conventions

### Naming and structure

- `src/app` route shell · `src/features/*` feature modules · `src/domain/*` pure logic · `src/data/*` repository and adapters · `src/i18n` · `src/ui` design primitives · `src/config`.
- Entities reference each other by **stable opaque string IDs** — `risk.categoryId`, `risk.businessUnitId`, `risk.riskOwnerId`, `control.ownerId`, `action.ownerId`, `user.roleIds[]`, `user.businessUnitIds[]`, `reportSection.dashboardId`. Never key off a display label.
- Risk technical ID: `risk_<timestamp>_<random>`. Business reference: `<BU CODE>-<3-digit sequence>` (e.g. `TECH-001`), fallback prefix `ERM`, no sequence reuse.
- Enums are TypeScript literal unions, not loose strings.
- Timestamps UTC ISO 8601; date-only fields ISO date (`YYYY-MM-DD`).

### Bilingual fields

Every master-data label is a pair: `*En` (required) and `*Ka` (optional). When the Georgian value is empty, the UI **falls back to English** — never renders blank. User-entered risk narratives are not translated automatically and may stay in one language.

### Persistence

- Storage key is `erm-risk-management-v3-state` — **retained deliberately for backward compatibility. Do not rename it.**
- Current `schemaVersion = 11`. The legacy `app.html` is at 7; the migration must handle it.
- Migration is **idempotent**, never intentionally deletes valid risk data, fills missing collections with defaults, repairs invalid references conservatively, and persists only after success.

### Audit and history are separate mechanisms

- **Assessment History** — created on risk creation and whenever `inherent`, `residual` or `target` changes. *Not* created for narrative/owner/status/control/action changes.
- **Audit Event** — created on every mutation, newest first, with `id, date, actorId, action, entityType, entityId, summary, changes?`.

Never collapse the two.

---

## Domain constraints (business rules — hold regardless of storage or backend)

### Risk engine

```
score  = impact × likelihood                    (impact, likelihood ∈ 1..5)
rating = matrix[impact][likelihood]             ← EXACT CELL, never a score range
color  = ratingColors[rating]
```

The risk record stores **only `impact` and `likelihood`** per assessment type. Two cells with the same score may carry different ratings — that is intended.

Default 2026 matrix (Impact rows 5→1, Likelihood columns 1→5):

```
5 Critical  Medium  High    High    Significant  Significant
4 Severe    Low     Medium  High    High         Significant
3 Major     Low     Medium  Medium  High         High
2 Moderate  Low     Low     Medium  Medium       High
1 Minor     Low     Low     Low     Low          Medium
```

Colours: Low `#00B050` · Medium `#FFF200` · High `#FFB900` · Significant `#F32121`.
Likelihood horizon is **next 12 months** (2026 matrix), not LEG-POL-001's older 3-year table.

The whole matrix is **administrator-configurable** (CR-003): the scale name, the four level display names, the impact and likelihood criterion names, descriptions and percentage bands, the colours and all 25 cells. `Low | Medium | High | Significant` remain the **stable stored keys** — renaming a level never touches cells, filters, saved views or exports. Every screen reads these through `src/domain/risk-engine` (`scaleName`, `ratingName`, `impactLabel`, `likelihoodBand`, …); no component may hold its own copy of a label, band or colour. Saving is explicit, versioned and audited, and assessment snapshots record the matrix version they were taken against.

### Required fields

`title`, `categoryId`, `riskOwnerId`, and **all three of `cause`, `event`, `consequence`**. `description` is a separate optional free-text field — manual only, never derived from the structured three. Response `Accept` requires an acceptance rationale; status `Accepted` requires approver, approval date and valid-until.

### Three indicators that must stay distinct

- **Historical Trend** — computed from the last two history snapshots' residual score (`<2` → New, lower → Improving, higher → Worsening, equal → Stable).
- **Direction to Target** — target vs residual.
- **Risk Outlook** — **manual** 12-month management judgement (`Increasing` / `Stable` / `Decreasing`). Never overwrite it with a computed trend.

### Overdue

`dueDate < today AND status != Completed` — derived, not stored. The UI may show an Overdue badge over another stored open status.

### Access control — five gates

```
Authenticated user
AND Module permission (None=0 < Read=1 < Edit=2, max across roles)
AND Route/action permission
AND Record-level scope
AND Field-level role rule
```

`risks: edit` alone never means "may edit every risk."

The **Dashboard module** (CR-004) is one aggregation — `src/domain/dashboard/analytics.ts` — over the register set the user may see, filtered through the SAME `matchesFilters` predicate the Register uses, so a widget total and the register result under identical filters are the same computation. Filter state lives in the URL; every tile, cell and segment links into the Register with the filters that reproduce it. Widget labels and colours come from the matrix configuration only.

Modules: `dashboard`, `register`, `risks`, `controls`, `actions`, `reports`, `audit`, `administration`. Website Administration sits **outside** this matrix behind a Super Admin–only guard.

Record visibility: Super Admin / Admin / Risk Manager → all; Auditor → all but read-only; Risk Owner → own risks; Control Owner → risks holding a control they own; Action Owner → risks holding an action they own; custom role → effective BU scope.

**Business Unit inheritance:** a direct grant on a parent covers the parent and *all* descendants including future ones; a grant on a child covers that child and its descendants only. **No upward and no sibling inheritance.**

**Field-level partial update:** Control Owner and Action Owner saves must not trust hidden fields — restore protected properties from the original record and merge only the authorised owned sub-records.

### Deactivate, don't delete

Categories, business units, custom attributes and users are deactivated, never hard-deleted — they are referenced by risks, ownership, assessments and audit. Deactivating a custom attribute hides the field but **preserves stored values**; reactivation restores them. Historical references must stay resolvable.

---

## Security constraints (non-negotiable)

- **Never put a secret in frontend code** — no Google client secret, no AWS credential, no access token, no sensitive configuration. Secrets live in environment variables / a secrets manager, and AWS S3 is reached only through the backend.
- **Never store authentication tokens or sensitive session data in `localStorage`.** Sessions use HttpOnly, Secure, SameSite cookies, with the session ID rotated after login.
- **Google Sign-In authenticates identity only.** Roles and permissions always come from the internal user-management system. Do **not** auto-provision users; do **not** grant access on email domain; do **not** derive permissions from Google profile data. Require `email_verified === true`, an existing **active** internal user with the same normalized email, and server-side ID-token validation (signature, issuer, audience, expiry, nonce) via Authorization Code + PKCE with `state`/`nonce` replay protection.
- Access-denied messages are **generic** — never reveal whether an email is registered.
- Audit successful logins, failed attempts, account-linking events and access denials. Apply login rate limiting.
- Follow OWASP Top 10, least privilege, secure defaults and input validation. Client-supplied role or scope claims are never trusted; every endpoint recomputes access.
- **The Phase 1 client-side guard is a workflow simulation, not a security boundary.** Say so; don't describe it as production security. Known Phase 1 gaps: readable/modifiable localStorage, plain-text local passwords, tamperable audit trail, inspectable seed data.

---

## Working rules

1. **Preserve existing functionality.** Do not remove, break or alter working behaviour unless the task explicitly requires it. The Risk Register, Administration (OU-based user/access management) and Site Administration all work today and must not regress.
2. **Preserve product and brand consistency.** Don't change design or UX unless the task requires it; any necessary change follows the existing branding, design system and interaction patterns.
3. **Improve safely.** Fix relevant bugs and improve performance, reliability and quality — without unnecessary changes or scope expansion.
4. **Build for maintainability.** Modular, readable, testable, documented where necessary, easy to extend.
5. **Validate every change.** Automated tests, security checks and QA. Confirm the requested outcome works *and* that existing functionality is unaffected.
6. **Deliver large changes incrementally.** Break work into the phases in `PLAN.md`; implement and validate each step before starting the next.
7. **Before an auth or security change:** inspect the existing auth architecture, user schema, permission model, API layer and session logic; identify compatibility and security risks; present a short plan; then implement in small testable phases. Avoid unrelated refactoring while doing it.

---

## Branding and UI

- Primary navy `#1A2151` · surface dark navy `#0D1128` · accent white. Risk colours come from the **configured matrix**, never hard-coded in a component.
- AIZEN cotton-flower logo **top-left**; uploadable client company logo **top-right** (admin-set, base64 in Phase 1); **ADMINISTRATION entry point bottom-left**.
- Runtime EN ⇄ ქართული toggle with English fallback.
- Route transitions are smooth with scroll-to-top, and reduced or disabled under `prefers-reduced-motion`.
- Accessibility baseline: every interactive control has a visible label or `aria-label`/`title`; keyboard focus is visible; **colour alone never carries meaning** — rating and status text is always shown; dialogs close via Cancel/Close without losing focus.

---

## Testing expectations

- Domain logic is unit-tested: all 25 matrix cells, `2×3=6 → Medium`, `5×4=20 → Significant`, effective-scope inheritance (parent covers descendants; child covers neither parent nor siblings), permission aggregation, reference generation, trend branches, overdue rule.
- Repository and migration have round-trip and idempotence tests, plus one test per repair case.
- RBAC is tested per role against every route and every mutation — including that Auditor cannot mutate and that crafted payloads from Control/Action Owners cannot alter protected fields.
- Import/export: valid current schema, valid legacy schema 7, and invalid input leaving state untouched.
- The regression matrix in `ARCHITECTURE.md` §13 defines what to retest after any given change.

---

## Repository map

```
app.html            legacy single-file build (reference for parity; do not extend)
docs/RM_Platform.pdf the spec — source of truth
index.html          Vite entry
src/                the refactored SPA (in progress)
public/             favicon.svg, icons.svg
ARCHITECTURE.md     system design, data models, module boundaries
PLAN.md             ordered milestones with acceptance criteria
```

`README.md` is still the stock Vite template text and should be replaced when the SPA is real.

---

## Things to check before claiming a task is done

- Does it regress the Register, Administration or Site Administration? Run the parity checklist for the affected area.
- Did a derived value get persisted by accident?
- Did a UI component reimplement rating, scope or permission logic?
- Did a new `localStorage` call land outside the adapter?
- Did a secret, credential or token reach frontend code or browser storage?
- Do `npm run lint` and `npm run build` both pass?
- Are the changes reflected in the audit trail where the spec requires an audit event?
