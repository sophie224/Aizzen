# ARCHITECTURE — Aizzen Risk Management Web Platform

**Source of truth:** `docs/RM_Platform.pdf` (PRD v0.1 + as-built addendum, AIZEN Risk & Compliance 4.1.0).
**Status:** target architecture for the refactor of `app.html` (single-file build) into a modular React + TypeScript SPA, with a Phase 2 backend cutover path.

> **Precedence rule.** Where the PRD (pp. 1–7: principles, scope, storage, branding, roles, admin, auth, Google Sign-In) conflicts with the addendum manuals (pp. 8–74, "Old Aizen documentation"), **the PRD wins**. Within the addendum, source priority is: Risk Rating Matrix 2026 → ERM Framework v1.0 → Risk Category Library 2026 → LEG-POL-001 → Change Requests → AIZEN 4.1.0 as-built code.

---

## 1. What the system is

A bilingual (ქართული / English) Enterprise Risk Management platform for:

- maintaining a **Risk Register**;
- assessing each risk on an **Inherent / Residual / Target** basis against a configurable 5×5 matrix;
- documenting **Existing Controls** and tracking **Remediation Actions**;
- formalising **Risk Acceptance**;
- reporting via a **Dashboard Builder** and **Report Template Builder**;
- administering master data, OU-style **Business Units**, users, roles and the rating matrix.

Two administrative spaces exist and must remain distinct:

| Space | Governs | Who can open it |
|---|---|---|
| **Risk Administration** (`/administration`) | categories, business units, custom attributes, users, roles, matrix, client branding, SSO draft, data tools | Administrator + Super Administrator |
| **Website Administration** | AIZEN public site, About Us, solutions, team members, demo media | **Super Administrator only** (dedicated role guard, *not* part of the module permission matrix) |

### 1.1 Non-negotiable constraints carried from the PRD

1. **No functional regression.** The Risk Register, the OU-based Administration, and the Site Administration page all work today; the refactor must preserve their behaviour and capabilities exactly.
2. **No unsanctioned design change.** Any necessary UI change must follow the existing branding, design system and interaction patterns.
3. **Backend-portable data model.** No business logic may be hard-coded to `localStorage`. If `localStorage` is used it is reached *only* through a replaceable adapter.
4. **Three interchangeable storage configurations** behind one contract (§4).
5. **Secure by default** — OWASP Top 10, least privilege, secure defaults, input validation, no secrets in the frontend.
6. **Incremental delivery** — large changes broken into validated phases (see `PLAN.md`).

---

## 2. Layered architecture

The refactor replaces a single 6 481-line `app.html` (React via `React.createElement`, bundled runtime inline, `schemaVersion: 7`) with the layer stack the addendum prescribes:

```
┌──────────────────────────────────────────────────────────────┐
│  Routes / Pages            /dashboard, /register,             │
│                            /risks/:id, /reports,              │
│                            /administration, /admin/site       │
├──────────────────────────────────────────────────────────────┤
│  Feature components        RiskRegisterTable, RiskEditor,     │
│                            DashboardBuilder, ReportBuilder,   │
│                            AdminSections, PublicSite          │
├──────────────────────────────────────────────────────────────┤
│  AppDataContext            authoritative AppState, the single │
│  (+ session/UI store)      update transaction, repository     │
│                            orchestration                      │
├──────────────────────────────────────────────────────────────┤
│  Domain layer (pure)       risk engine · permissions · BU     │
│                            tree · trend · reference generator │
│                            · validators · formatters · i18n   │
├──────────────────────────────────────────────────────────────┤
│  AppRepository (interface) getState / saveState / reset /     │
│                            exportJson / importJson            │
├──────────────────────────────────────────────────────────────┤
│  Adapters   LocalStorageRepository │ ApiRepository (on-prem)  │
│                                    │ ApiRepository (AWS)      │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 Layer responsibilities

| Layer | Owns | Must never |
|---|---|---|
| Page / component | display, local form draft, user interaction | call `localStorage` directly; re-implement rating logic |
| `AppDataContext` | current `AppState`, the deep-clone → mutate → audit → save transaction, repository orchestration | contain business rules that belong to the domain layer |
| Session/UI store (Zustand-style) | authenticated session reference, language toggle, sidebar/modal UI state | hold authoritative business data |
| Domain helpers | score, rating, colour, trend, effective scope, validators, reference generation | perform I/O or touch React |
| Repository | read / save / reset / import / export | leak storage-specific shapes upward |

### 2.2 The single mutation path

Every business-data change goes through one deterministic pipeline. This is a **business rule**, not an implementation detail:

```
1. read current AppState
2. deep-clone
3. apply a deterministic mutator
4. append assessment history (only if scores changed) and an audit event
5. repository.save(nextState)
6. publish next state to the UI / invalidate query state
```

A component calling `localStorage.setItem` directly is a defect. In Phase 2 the same pipeline becomes an API call whose server-side handler wraps entity write + history + audit in **one transaction** — if the audit insert fails, the mutation rolls back.

### 2.3 Derived values are never stored

Deterministically computable values must be recomputed at runtime so that a matrix/config change is reflected identically everywhere:

`risk score` · `risk rating` · `rating colour` · `historical trend` · `direction to target` · `effective Business Unit scope` · `overdue action indicator` · `filtered dashboard metrics`.

The risk record therefore stores **only `impact` and `likelihood`** per assessment type.

---

## 3. Data model

### 3.1 AppState (the persisted aggregate)

```
AppState {
  schemaVersion      // current: 8
  users[]            roles[]            categories[]
  businessUnits[]    customAttributes[] matrix
  risks[]            savedViews[]       dashboards[]
  reportTemplates[]  auditEvents[]      branding
  ssoConfig          siteContent
  // + local session references (not authoritative business data)
}
```

Entities reference each other by **stable opaque string IDs** (UUID/ULID in Phase 2):

```
risk.categoryId       → category.id
risk.businessUnitId   → businessUnit.id
risk.riskOwnerId      → user.id
control.ownerId       → user.id
action.ownerId        → user.id
user.roleIds          → role.id[]
user.businessUnitIds  → businessUnit.id[]
reportSection.dashboardId → dashboard.id
```

### 3.2 Risk

| Field | Type | Rule |
|---|---|---|
| `id` | string | `risk_<timestamp>_<random>` |
| `ref` | string | `<BU CODE>-<3-digit sequence>`, e.g. `TECH-001` |
| `title` | string | required; trimmed on save |
| `type` | enum | `Current` \| `Emerging` — manager-level field |
| `categoryId` | string | must be an active/current category |
| `businessUnitId` | string | must match user access scope |
| `riskOwnerId` | string | active, BU-scoped user |
| `originDate` | date | default: today |
| `reviewDate` | date | default: today + 12 months |
| `targetDate` | date | default: today + 6 months |
| `status` | enum | manager controlled (`Draft` default) |
| `responseType` | enum | `Avoid` \| `Mitigate` \| `Transfer` \| `Accept` |
| `outlook` | enum | `Increasing` \| `Stable` \| `Decreasing` — **manual**, never overwritten by computed trend |
| `description` | text | manual free-text summary, optional, max 2 000 chars — **never derived from cause/event/consequence** (CR-002) |
| `cause` / `event` / `consequence` | text | **all three required** |
| `statusNarrative` | text | monitoring/reporting narrative |
| `inherent` / `residual` / `target` | `Score` | `{ impact: 1–5, likelihood: 1–5 }` |
| `controls[]` | Control[] | may be empty |
| `actions[]` | Action[] | may be empty |
| `acceptance` | Acceptance | required when response/status implies acceptance |
| `custom` | object | keyed by custom-attribute ID |
| `history[]` | HistoryItem[] | initial + score-change snapshots |
| `audit[]` | AuditEvent[] | risk-specific events, newest first |
| `updatedAt` | datetime | refreshed on save |

**Score object** — `{ impact: 1|2|3|4|5, likelihood: 1|2|3|4|5 }`. Score and rating are *not* persisted.

### 3.3 Control

`id` · `title` (empty title ⇒ dropped on save) · `ownerId` · `performer` · `description` · `frequency` (Continuous/Daily/Weekly/Monthly/Quarterly/free text) · `intendedOutcome` · `evidenceLocation` · `keyControl` (boolean) · `type` (Directive/Preventative/Detective/Corrective) · `automation` (Manual/Automated/Semi-Automated) · `status` (Effective/Needs Improvement/Ineffective/Not Assessed).

A control record must answer: who owns it, who performs it, what it covers, at what frequency, what the intended outcome is, where evidence lives, and whether it is a Key Control.

### 3.4 Remediation Action

`id` · `title` (empty ⇒ dropped on save) · `description` · `deliverable` · `ownerId` · `dueDate` · `status` (Not Started/In Progress/Blocked/Rescheduled/Overdue/Completed) · `priority` (Low/Medium/High/Critical) · `progress` (0–100, step 5) · `notes`.

Defaults for a new action: due date = today + 3 months, status `Not Started`, priority `Medium`, progress 0, owner = matching Action Owner with Risk Owner fallback.

**Overdue is derived:** `dueDate < today AND status != Completed`. The UI may show an Overdue badge even when the stored status is another open status.

### 3.5 Acceptance

`rationale` · `initiatorId` · `approverId` · `approvalDate` · `validUntil` · `reviewDate`.

Business rules: `responseType = Accept` ⇒ rationale required; `status = Accepted` ⇒ approver + approvalDate + validUntil required. Framework validity is six months from approval date (Phase 1 defaults to six months but does not auto-enforce recalculation; Phase 2 API must enforce validity policy, approval authority, expiry reminders, re-approval and immutable decision history). Acceptance of a High/Significant risk is an exceptional decision requiring an escalation path.

### 3.6 Assessment History vs Audit Event

Two deliberately separate mechanisms:

```ts
HistoryItem { id; date: 'YYYY-MM-DD'; inherent: Score; residual: Score; target: Score; note: string; actorId: string }

AuditEvent  { id; date: ISO datetime; actorId; action; entityType; entityId; summary; changes?: string[] }
```

| | Assessment History | Audit Event |
|---|---|---|
| Purpose | time-series of score state, drives trend | actor/action trace |
| Created when | risk created; inherent/residual/target object changes | every mutation |
| **Not** created for | narrative/owner/status/control/action change without a score change | — |

Global `auditEvents` powers Recent Activity and Administration review; the risk-scoped list powers the Individual Risk timeline. Order is newest-first.

### 3.7 Administration master data

- **Category** — two levels: `level1En` (required), `level1Ka`, `level2En` (required), `level2Ka`, `active`. Seed library: 5 Level 1 groups, 38 Level 2 categories. Never hard-delete a used category — deactivate; old risks keep the reference and historical reporting still resolves the label.
- **Business Unit** — `id`, `code` (required, unique, uppercase), `nameEn` (required), `nameKa`, `parentId` (blank = root), `active`. Unlimited depth.
- **Custom Attribute** — `id` (stable key into `risk.custom`), `labelEn`, `labelKa`, `type` (`text` | `number` | `date` | `select` | `user`), `options` (comma-separated, trimmed, empties dropped), `active`, `showInRegister`. Defaults: number → `0`, everything else → `''`. Deactivating hides the field but **never deletes stored values**.
- **User** — `id`, `name` (required), `title`, `email` (required, login identifier), `password` (Phase 1 demo only), `status` (Active/Inactive), `roleIds[]` (≥1 required), `businessUnitIds[]` (≥1 required). Phase 2 adds the Google `sub` identifier (§6). No hard delete — deactivate, because users are referenced by ownership, controls, actions, assessments and audit.
- **Role** — nameEn, nameKa, description, and a permission level per module.
- **Matrix** — 25 cells `{ impact, likelihood, rating }` plus four rating colours.

### 3.8 Phase 2 relational target

```
Organization 1—* Membership *—1 User        Membership *—* Role
Role 1—* Permission                          BusinessUnit 1—* BusinessUnit(parent)
Membership *—* BusinessUnitScope             Category 1—* Risk
BusinessUnit 1—* Risk                        User 1—* RiskOwnerAssignment
Risk 1—* Assessment | Control | RemediationAction | Acceptance | AuditEvent
Dashboard 1—* Widget    ReportTemplate 1—* ReportSection    User 1—* SavedView
```

Recommended tables: `organizations, users, memberships, roles, permissions, business_units, categories, custom_attributes, risks, risk_owner_assignments, risk_assessments, assessment_history, controls, control_versions, remediation_actions, acceptances, approvals, attachments, dashboards, report_templates, saved_views, audit_events`.

---

## 4. Storage architecture — one contract, three configurations

The data-access layer is decoupled from the storage implementation. All three configurations use the **same data contract** and are selectable **through configuration only** — no business-logic change.

```ts
interface AppRepository {
  getState(): Promise<AppState>;
  saveState(state: AppState): Promise<AppState>;
  reset(): Promise<AppState>;
  exportJson(state: AppState): string;
  importJson(text: string): Promise<AppState>;
}
```

| # | Configuration | Implementation | Notes |
|---|---|---|---|
| 1 | **Backend-portable / local** | `LocalStorageRepository` | read JSON · seed when missing · migrate old schema · repair invalid references · persist current schema. Storage key `erm-risk-management-v3-state` (**retained deliberately for backward compatibility**). |
| 2 | **On-premises repository** | `ApiRepository` → locally hosted API | same interface, HTTP implementation, normalized server DTO mapping, auth/session error handling, optimistic update + query invalidation, **no UI rewrite**. |
| 3 | **AWS S3** | `ApiRepository` → backend → S3 bucket | **AWS credentials must never reach the frontend.** The browser talks to the application API; the API holds IAM credentials from a secrets manager and performs S3 access server-side. |

**Data-store rule:** transactional risk data belongs in PostgreSQL/RDS. S3 is appropriate for evidence, logos/media, exports, snapshots and the immutable audit archive — **S3 alone must not be the primary concurrent transactional risk database.**

### 4.1 Schema migration and repair

Current `schemaVersion = 11` (9 added the manual `Risk.description` from CR-002; 10 adds the configurable rating matrix from CR-003 — matrix version, scale name, level display names, criterion descriptions and percentage bands, plus `matrixVersions` and the `matrixVersion` stamp on assessment snapshots; 11 adds the Dashboard module's saved views and per-user widget layouts from CR-004. Every step is additive and migration fills what is missing without overwriting configured values. The legacy `app.html` is at 7 — the migration path must handle it). Migration is **idempotent**, never intentionally deletes valid risk data, fills missing collections with defaults, repairs invalid references conservatively, and persists only after a successful migration.

| Problem | Repair |
|---|---|
| Missing Super Admin role/user | add defaults |
| Old flat Business Units | add `parentId` / default tree |
| Self-parent or cycle | clear the offending parent link |
| Missing / invalid parent | clear or replace |
| User references a deleted BU | remove the invalid BU ID |
| Saved View lacks columns/mode | add default `visibleColumns` / `viewMode` |
| Missing dashboards / reports / site content | restore seed defaults |
| Incomplete matrix | merge/restore default cells and colours |

Migration must preserve: risk IDs and references, scores, controls/actions, valid ownership references, assessment history, audit events, dashboard/report definitions, custom values.

### 4.2 Import / export

- **Full JSON backup** (Administration → Data Tools) serialises the complete `AppState` — schema version, users/roles, categories/BUs/attributes, risks/controls/actions/history/audit, dashboards/reports/saved views, branding, SSO draft, public-site content. Used for device transfer, manual backup, QA fixtures and as the Phase 2 migration source.
- **Import** flow: select file → parse → structural validation (minimum `risks`/`users` arrays) → migrate/repair → replace state → persist → refresh. **Invalid JSON or structure leaves state untouched.**
- **Reset demo data** requires confirmation and replaces state with the seed.
- **Register CSV / SpreadsheetML `.xls` export** contains only the currently visible, filtered records plus active custom attributes — it is *not* a backup and cannot restore state. CSV values are escaped for comma, quote and newline.
- **Audit-only JSON export** is review data, not a restore package.

Phase 2: separate export permission, audited export events, masking policy, async jobs for large exports, signed temporary downloads, import dry-run + approval.

---

## 5. Authorization architecture

### 5.1 Five gates

Every read and every mutation is decided by the conjunction:

```
Authenticated user
AND Module permission        (None < Read < Edit)
AND Route / action permission
AND Record-level scope
AND Field-level role rule    (where applicable)
```

`risks: edit` alone does **not** mean "may edit every risk".

### 5.2 Module permission matrix

Modules: `dashboard`, `register`, `risks`, `controls`, `actions`, `reports`, `audit`, `administration`. Levels: `None = 0`, `Read = 1`, `Edit = 2`. With multiple roles, effective permission per module is `max(...)`.

| Role | Dashboard | Register | Risks | Controls | Actions | Reports | Audit | Administration |
|---|---|---|---|---|---|---|---|---|
| Super Administrator | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit |
| Administrator | Edit | Edit | Edit | Edit | Edit | Edit | Edit | Edit |
| Risk Manager | Read | Edit | Edit | Edit | Edit | Edit | Read | None |
| Risk Owner | Read | Read | Edit | Edit | Edit | Read | Read | None |
| Control Owner | Read | Read | Read | Edit | Read | None | Read | None |
| Action Owner | Read | Read | Read | Read | Edit | None | Read | None |
| Auditor | Read | Read | Read | Read | Read | Read | Read | None |

Website Administration sits outside this matrix behind a Super Admin guard.

### 5.3 Record-level visibility

| Role | Sees |
|---|---|
| Super Administrator / Administrator / Risk Manager | all risks |
| Auditor | all risks, read-only |
| Risk Owner | risks where `riskOwnerId = currentUser.id` |
| Control Owner | risks with ≥1 control whose `ownerId = currentUser.id` |
| Action Owner | risks with ≥1 action whose `ownerId = currentUser.id` |
| Custom role | risks inside the user's effective Business Unit scope |

The Register consumes **only** `visibleRisks(currentUser)`; search, filters and sorting operate on that set. A hidden risk cannot be reached through search or a direct URL.

### 5.4 Business Unit effective scope (OU-style inheritance)

```
Direct grant on a parent  → parent + ALL descendants (including future ones)
Direct grant on a child   → child + its descendants only
No upward inheritance. No sibling inheritance.
```

Example: a user scoped to *Information Security* cannot see *Technology Division* parent-level risks or *IT Operations* sibling risks. In the user editor, direct scope is a checkbox; inherited descendants render as `Inherited` and cannot be individually unchecked while the parent direct scope is active. Direct and effective counts are displayed separately.

Core tree helpers (domain layer): get descendants · get ancestors · build full path · flatten for picker · calculate effective scope · detect/repair cycles.

### 5.5 Field-level partial update

Control Owner and Action Owner saves **must not trust hidden fields**. The update path restores protected risk properties from the original record and merges only the authorised owned sub-records.

| Role | May change |
|---|---|
| Administrator / Super Administrator / Risk Manager | the full risk record |
| Risk Owner | on own risks only: assessment, narrative, dates, response/outlook, controls, actions, custom fields — manager-only master fields/owner/status are locked |
| Control Owner | own controls only |
| Action Owner | own actions only |
| Auditor | nothing |

### 5.6 Known limitation → Phase 2 requirement

Phase 1 client logic evaluates named-role branches **in order**, so a user holding e.g. both Risk Owner and Control Owner may get visibility from the first matched role rather than the union of all scopes. Phase 2 backend authorization must union record-level grants and decide every permission server-side. Client-supplied role/scope claims are never trusted.

---

## 6. Authentication architecture

### 6.1 Phase 1 (as-built, explicitly *not* production security)

Email normalized-match → user must be `Active` → plain-text password equality → session user ID stored in browser state → session restored on refresh → logout clears the reference. Known gaps: unhashed passwords, no secure cookie, no MFA, no brute-force protection, editable local state, no server trust boundary. The Administration guard is client-side and is a *workflow simulation, not a security boundary*.

**Demo users** (demo-only passwords): `admin@erm.local` (Administrator), `s.phikidze@aizzen.com` (Administrator), `d.baghdavadze@aizzen.com` (Administrator), plus a Super Admin account with both front-page management and risk-module access.

### 6.2 Google Sign-In with internal authorization (PRD requirement)

Google authenticates **identity only**. Access, roles and permissions stay under the internal user-management system.

```
Sign in with Google
  → Authorization Code flow with PKCE
  → server-side ID-token validation
       signature · issuer · audience · expiry · nonce · state
  → require email_verified === true
  → find ACTIVE internal user with the same NORMALIZED email
  → require internal permission to access the application
  → first login: link and store Google's stable `sub`
  → subsequent logins: identity via linked `sub`, still verifying the account is active
  → roles + permissions loaded ONLY from the internal authorization system
  → create session: HttpOnly, Secure, SameSite cookie; rotate session ID (anti-fixation)
```

Hard rules:

- **Never auto-provision.** An administrator must create the user first.
- **Domain membership grants nothing.** `@aizzen.com` alone is not access; a matching active internal record must exist.
- **Never derive permissions from Google profile data.**
- Never expose the Google client secret, access tokens or sensitive config in frontend code — secrets live in environment variables / a secrets manager.
- **Do not store authentication tokens or sensitive session data in `localStorage`.**
- Generic access-denied messages that do not reveal whether an email is registered.
- Login rate limiting; audit-log successful logins, failed attempts, account-linking events and access denials.

The Google button is added to the existing login page without changing the design system, and without removing or degrading existing authentication or Administration functionality.

### 6.3 SAML / SSO roadmap

The Administration → SSO section stores a **configuration draft** (Provider Name, IdP Entity ID, metadata URL/XML, ACS URL, email attribute, role/group attribute, role mappings, Enabled toggle). It performs no real SAML authentication in Phase 1; the Enabled toggle raises an audit event. Intended flow: Sign In → IdP redirect → signed assertion posted to ACS → backend validates signature/audience/time → extract email/groups → match a **pre-provisioned Active** user → map groups to AIZEN roles → secure session. JIT provisioning is off by default. Phase 2 mandatory controls include signed-assertion validation, certificate rotation, replay prevention, HTTPS-only ACS, domain allowlist, group-to-role mapping validation, login audit and a break-glass admin account.

---

## 7. The risk engine (single source of calculation)

```
inputs : assessmentType, impact 1..5, likelihood 1..5, matrix configuration/version
outputs: score  = impact × likelihood
         rating = matrix[impact][likelihood]        ← EXACT CELL, not a score range
         color  = ratingColors[rating]
```

**Exact-cell rule.** Rating is read from the selected impact × likelihood intersection in the configured 25-cell matrix. Two cells with the same numeric score may therefore carry different ratings after a configuration change.

**Consistency requirement.** Register chips, detail cards, heatmaps, dashboard metrics, filters, reports and exports must all call this one engine. *Duplicate rating logic in UI components is prohibited.*

Impact labels: 1 Minor / 2 Moderate / 3 Major / 4 Severe / 5 Critical (assessed across Financial, Reputational, Operational — Technology/Process/People — and Regulatory & Legal; the final impact is the **highest** applicable score).
Likelihood labels (next 12 months): 1 Remote 0–5% · 2 Unlikely 6–35% · 3 Possible 36–65% · 4 Likely 66–95% · 5 Almost Certain 96–100%.

**Default 2026 matrix** (rows = Impact 5→1, columns = Likelihood 1→5):

| Impact ↓ / Likelihood → | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 5 Critical | Medium | High | High | Significant | Significant |
| 4 Severe | Low | Medium | High | High | Significant |
| 3 Major | Low | Medium | Medium | High | High |
| 2 Moderate | Low | Low | Medium | Medium | High |
| 1 Minor | Low | Low | Low | Low | Medium |

Colours: Low `#00B050` · Medium `#FFF200` · High `#FFB900` · Significant `#F32121`.

Phase 2: the frontend score is a **preview only** — the API independently re-verifies impact, likelihood, matrix version and rating, returning e.g. `{ impact: 4, likelihood: 5, score: 20, rating: "Significant", matrixVersionId: "matrix-2026-v1" }`. An approved historical assessment stays pinned to the matrix version used.

### 7.1 Trend, direction and outlook (three distinct indicators)

```
Historical Trend      compare residual score of the last two history snapshots
                      history.length < 2 → New | lower → Improving
                      higher → Worsening | equal → Stable
Direction to Target   target < residual → Decreasing toward target
                      target = residual → At target / Stable
                      target > residual → Increasing
Risk Outlook          MANUAL 12-month management judgement:
                      Increasing | Stable | Decreasing — never auto-overwritten
```

### 7.2 Risk reference generation

```
prefix = uppercase(businessUnit.code)          // fallback 'ERM' when blank
next   = max(numeric suffix of existing refs with that prefix) + 1
ref    = prefix + '-' + padStart(next, 3, '0')  // TECH-001, SEC-004, LRC-002
```

Existing references never change when a Business Unit is later edited; a new risk's reference recalculates when the BU changes in the editor. Sequence numbers are never reused (Phase 1 has no risk delete at all).

---

## 8. Module boundaries

### 8.1 Routes

| Route | Purpose | Minimum permission |
|---|---|---|
| `/` | public website — home | none (no session required) |
| `/about` | public website — About Us | none (no session required) |
| `/login` | sign-in | none |
| `/dashboard` | view and (with rights) manage dashboards | `dashboard: read` |
| `/register` | Risk Register | `register: read` **and** `risks: read` |
| `/risks/:id` | Individual Risk View | record visibility |
| `/reports` | Report template library + generated reports | `reports: read` |
| `/administration` | Risk Administration | Administrator / Super Administrator |
| Website Administration | public-site CMS | Super Administrator only |

The platform pages sit at the top level and share `AppShell` through a pathless layout route. They previously lived under an `/app` prefix; `/app/*` now redirects to the equivalent top-level path (`src/app/legacy-app-path.ts`), preserving query string and hash, so older links keep working. The prefix must not come back: the legacy reference build is a file named `app.html`, and Vite's dev-server HTML fallback resolves a request for `/app` to it — which is why that file lives in `legacy/`, not at the repository root.

### 8.2 Risk Management module

**In scope:** Dashboard Builder · Risk Register · risk creation/editing · Individual Risk View · 5×5 assessment · Existing Controls · Remediation Actions · Risk Acceptance · Assessment History · local audit trail · Saved Register Views · CSV/Excel export · Report Template Builder · bilingual UI · role- and BU-scope-aware visibility.

**Out of scope in Phase 1:** server-side database · real SAML/OIDC · immutable audit ledger · email notifications · approval workflow engine · file/evidence repository · concurrent editing and conflict detection · reminder scheduler · API-enforced permissions.

**Risk Register.** Case-insensitive search across risk reference, title, description, cause, event, consequence, category name, BU name *and full hierarchy path*, risk owner name and remediation action title. Filters: Risk Category (Level 1 group), Business Unit (selected + all descendants), Residual Rating, Risk Status, Risk Outlook — dashboards and report sections add Risk Type and Risk Owner. Sorting: title, owner, residual numeric score, target date; default risk reference ascending; clicking a header toggles direction. Two display modes — Compact (condensed management list) and Detailed (Cause/Event/Consequence, control/action detail, and equal-sized Inherent/Residual/Target chips showing `Score | Rating | Impact × Likelihood`). Column visibility is user-selected; an active custom attribute with `showInRegister = true` automatically joins the selectable columns.

**Saved Views** persist search/filter state, sort state, visible columns, Compact/Detailed mode, owning user and `isDefault`. Actions: save current, apply, set default, clear default, remove. One default per user; setting a new default clears the old; the Register auto-applies the current user's default on open; deleting the default leaves the Register on its current state. Saved Views are user-specific and invisible to others.

**Risk Editor** — six tabs: Basic · Structured Description · Assessments · Controls · Actions · Custom Fields. Creation is limited to Super Administrator / Administrator / Risk Manager holding `risks: edit`. Owner dropdowns list only active users with the right role capability inside the selected risk's BU effective scope. The editor works on a **cloned draft** — Cancel and modal close persist nothing; the repository is updated only after a successful Save.

**Save workflow:** clone → apply edits locally → validate required fields → clean controls/actions → compare assessment objects → append history if a score changed → append audit event → `repository.save` → close/refresh.

**Validation** blocks Save when: title empty · no category · no risk owner · cause/event/consequence empty · `Accept` response without rationale · `Accepted` status without approver, approval date or valid-until.

**Individual Risk View** — header band (reference/title, category/BU, risk owner, action-owner context, three scores, target date, status) plus five tabs: Overview · Assessment · Controls · Actions · Trend & Audit.

### 8.3 Dashboard Builder

Seven filters (Business Unit, Category, Status, Residual Rating, Risk Type, Risk Owner, Outlook) persisted in the dashboard definition and restored on open. CRUD: add, edit metadata, duplicate (new ID + independent widget collection), delete, shared toggle, accent colour, EN/KA name and description. **The last remaining dashboard cannot be deleted.** Deleting a dashboard removes the report sections bound to it so no broken references remain.

Seven widget types: Metric · Heatmap · Distribution/Bar · Top Risks · Action Plan Progress · Recent Activity · Trend Summary. Widget config: EN/KA title, foreground/accent colour, background colour, grid span 3/4/6/8/12, score basis, grouping, metric type, limit 1–20, add/duplicate/remove/reorder.

```
Total Risks          = all filtered risks
Open Risks           = status != Completed
Significant Residual = residual rating == Significant
Overdue Actions      = due date passed and not Completed
Emerging Risks       = risk.type == Emerging
Completed Actions    = action.status == Completed
```

### 8.4 Report Template Builder

Templates combine three section types, each independently configurable and reorderable (add / move up-down / duplicate / delete):

1. **Dashboard section** — selects a saved dashboard and carries its own BU/category/status/rating/type/owner/outlook filters, so one report can present the same dashboard at several scopes.
2. **Open Text section** — EN/KA title and narrative for Executive Summary, Management Commentary, Recommendations, Decisions Required.
3. **Compact Risk Register section** — selectable base columns + selectable active custom-attribute columns, independent filters, template-driven column order. **At least one column must remain selected.**

Print/PDF uses the browser print dialog in Phase 1; Phase 2 recommends server-side rendering against a versioned template snapshot.

### 8.5 Risk Administration module — ten sections

1. Administration Overview — counts of active categories, BUs, users, custom attributes, roles and audit events (`active count = items where active/status is true/Active`; role count = all configured roles; audit count = `AppState.auditEvents.length`). It does **not** verify configuration completeness.
2. Categories · 3. Business Units · 4. Custom Attributes · 5. Users · 6. Roles & Permissions · 7. Rating Matrix · 8. Branding · 9. SSO/SAML Roadmap · 10. Data Tools.

Sidebar selection switches the workspace from URL/state; unsaved modal drafts do not persist across module changes.

**Branding.** The client company logo (top-right) is uploaded in Risk Administration, stored as a base64 data URL in `AppState` in Phase 1, restored from storage on refresh, and removable back to the placeholder. The **AIZEN cotton-flower logo (top-left) and public-site content belong to Website Administration / Super Admin scope** — a Risk Administrator can change the client logo but not AIZEN's website copy or team members. Phase 2 moves logos to S3/object storage with MIME/size validation, optimisation and signed upload.

**Administration audit** covers category, BU, custom attribute, user, role, matrix, branding, SSO, import and reset changes. Administration changes are high-risk privileged actions; Phase 2 audit must carry actor snapshot, before/after, changed fields, reason/ticket, session/request/IP, approval where required, and tamper-evident retention.

### 8.6 Cross-module dependency map

| Administration object | Consumed by |
|---|---|
| Category | Risk Editor, Register, Dashboards, Reports, Export |
| Business Unit | risk ownership, user scope, access control, filters, reference generation |
| Custom Attribute | Risk Editor, Register columns, Reports, Export |
| User | login, Risk/Control/Action Owner, audit actor |
| Role | routes, modules, edit/read controls |
| Rating Matrix | all score chips, matrices, filters, heatmaps, reports |
| Branding | application header / client identity |
| SSO Config | Phase 2 authentication |
| Data Tools | the whole `AppState` lifecycle |

---

## 9. Presentation, i18n and accessibility

**Brand palette.** Primary navy `#1A2151`, surface dark navy `#0D1128`, accent white; risk colours per the rating matrix. AIZEN cotton-flower logo top-left; uploadable client logo top-right; **ADMINISTRATION entry point in the bottom-left corner**.

**i18n.** Runtime English ⇄ ქართული toggle. Master data carries EN and KA labels; when the Georgian translation is empty the UI falls back to the English value. User-entered risk narratives may stay in one language — there is no automatic translation.

**Navigation.** Risk routes use a smooth enter transition and scroll-to-top; animation is reduced or disabled under `prefers-reduced-motion`.

**Accessibility baseline.** Every interactive control has a visible label or `aria-label`/`title`; keyboard focus is visible; colour is never the only carrier of meaning (rating/status text is always shown); dialogs close via Cancel/Close without losing focus.

---

## 10. Error handling

| Category | Behaviour |
|---|---|
| Validation error | inline field message |
| Authorization error | deny, no state mutation |
| Not found / hidden by scope | safe empty or not-found view |
| Import parse error | preserve current state |
| Repository write failure | show error, keep the modal draft |
| Migration error | do not overwrite the raw source; offer backup/export |

Notable edge cases: opening a hidden risk ID → access denied/not found · no categories/BUs/users → New Risk save blocked by validation · corrupt matrix cell → migration/default repair with a fallback rating · removed category still referenced → mark inactive, keep the reference · empty control/action title → removed on save · invalid JSON import → state unchanged · valid but old schema → migrate/repair before persist · delete last dashboard → blocked · report referencing a deleted dashboard → those sections removed with the dashboard · deleted default Saved View → default cleared, Register stays usable · cleared browser storage → data lost unless a JSON backup exists.

**Phase 2 HTTP mapping:** 400 invalid data · 401 unauthenticated · 403 authenticated but unauthorized · 404 not found *or hidden by scope* · 409 version conflict/duplicate · 422 business-rule validation · 429 rate limit · 500 unexpected.

**Concurrency.** Phase 1 is last-save-wins with no conflict detection across tabs or users. Phase 2 gives every mutable aggregate a version/ETag: client reads v7 → `PATCH If-Match: 7` → server writes v8 → a stale client sending v7 gets **409 Conflict**. Risk, assessment, control and action may use separate version boundaries.

---

## 11. Security boundaries

**Phase 1 known risks (accepted, must be documented, must not be presented as production security):** localStorage data is readable and modifiable; passwords are stored locally in plain text; the audit trail is tamperable; all bundled seed data is inspectable; `file://` origin behaviour varies by browser; there is no centralised backup/retention and no application-controlled encryption at rest.

**Production controls:** HTTPS only · SSO/MFA · HttpOnly session cookies · least-privilege IAM · database encryption and backups · S3 evidence encryption and versioning · server-side RBAC/RLS · immutable, tamper-evident audit · secrets manager · CSP and security headers · dependency scanning · regular authorization tests.

---

## 12. Phase 2 backend

The backend becomes the authoritative source for: authentication/session · RBAC and record-level authorization · matrix calculation and versioning · validation · workflow status transitions · acceptance approvals · the audit ledger · reminders/notifications · attachment/evidence storage · concurrency control · backup and restore.

**Recommended architectures**

```
Portable                          AWS
React SPA                         CloudFront + S3 (static frontend)
  → NestJS REST API               API Gateway / ALB
      → PostgreSQL                ECS Fargate NestJS API
      → S3 / MinIO evidence       RDS PostgreSQL
      → Redis/queue reminders     S3 attachments + audit archive
      → SAML/OIDC adapter         Cognito or direct Entra/Okta federation
                                  CloudWatch + CloudTrail · Secrets Manager · SES
```

**Administration endpoints:** `GET/POST/PATCH /categories · /business-units · /custom-attributes · /users · /roles`; `GET/PUT /rating-matrix · /branding`; `GET/PUT/TEST /identity-providers`; `POST /exports · /imports/validate · /imports/commit`; `GET /audit-events`.

**API contract principles.** Explicit versioned DTOs · the client never sends a calculated rating as authoritative · hidden fields cannot be mass-assigned · list endpoints apply scope *before* pagination · filter options are tenant/scope aware · soft-deleted referenced data stays resolvable for history · UTC ISO 8601 timestamps and ISO dates · opaque UUID/ULID IDs · every mutation supports a correlation/request ID · optimistic version fields with 409 on stale writes · approved assessments immutable (new version required) · owner-assignment history retained · soft-delete for master data and users · export endpoints authorized and audited · every mutation writes its audit event in the same transaction · admin endpoints deny non-privileged callers independently of the UI.

**Migration script:** validate schema → normalize IDs/emails/dates → create organization → import master data → import users/roles/scopes → import risks and children → import dashboards/reports/saved views → store original source IDs for traceability → produce a reconciliation report → archive the original JSON encrypted.

**Definition of done for cutover:** UI runs on `ApiRepository` in production · all writes server-validated · role/scope tests pass against the API · SSO session works · matrix versioning works · risk owner/assessment/control/action history retained · immutable audit written transactionally · local JSON migration reconciles counts · backup/PITR restore tested · evidence storage secured · performance and security tests pass · **no production credential or data remains in localStorage**.

---

## 13. Regression matrix

Any change to the left column requires retesting the right column:

| Change | Must retest |
|---|---|
| Category update | risk editor, register filter, dashboards, reports, export |
| Business Unit move | user effective scope, risk visibility, filters, owner pickers, reference generation |
| Role permission | routes, buttons, API/record guards, auditor behaviour |
| Matrix cell/colour | all three assessments, chips, filters, heatmap, reports, history interpretation |
| Custom attribute | risk editor, register columns, saved views, report columns, export/import |
| User deactivation | login, owner pickers, historical display, assignments |
| Dashboard deletion | report sections and print |
| Schema change | old backup import, current data persistence, reset seed |

The referenced build's QA baseline is 305/305 across architecture/build (58), seed/domain (34), public site (31), authentication (32), RBAC (32), Super Admin CMS (15), dashboard (12), register/risk (44), reports (18), administration (16) and migration/persistence/accessibility (13). That baseline records tested behaviour — it does not remove the Phase 1 security limitations or substitute for production penetration and performance testing.

---

## 14. Open product decisions

These are not fully defined by the sources and need Product/Risk approval before backend implementation:

1. exact status-transition matrix for Risk, Assessment and Acceptance;
2. approval authorities by rating and Business Unit;
3. whether a Completed action must always have progress = 100;
4. whether Residual may be lower than Target or Inherent in all cases;
5. whether a Risk Owner may **create** controls/actions or only update them;
6. multiple-role record-visibility union rules;
7. category/attribute deletion and remapping policy;
8. risk register uniqueness rule for titles;
9. evidence attachment taxonomy and retention;
10. KRI / Risk Appetite module scope;
11. reporting period freeze/snapshot rules;
12. notification/reminder frequency.

Until these are approved, the implementation follows documented Phase 1 behaviour and keeps recommended Phase 2 controls labelled separately.
