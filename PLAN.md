# PLAN — Aizzen RM Platform Refactor

Ordered, independently-testable milestones for refactoring `app.html` (single 2.5 MB file, `React.createElement`, `schemaVersion: 7`) into the modular React + TypeScript SPA described in `ARCHITECTURE.md`, then opening the Phase 2 backend path.

**Governing principle from the PRD:** *Deliver large changes incrementally.* Each milestone below is implemented and validated before the next begins. No milestone may introduce a functional regression in the Risk Register, Administration, or Site Administration.

---

## How to read this plan

- **Milestones are ordered.** M2 depends on M1, and so on. Where two milestones are genuinely parallelisable it says so.
- **Independently testable** means: at the end of the milestone you can run a defined check and get a pass/fail answer without needing the next milestone's code.
- **Acceptance criteria** are the pass conditions. A milestone is not done until every box is checked and the **standing regression gate** (below) is green.
- **Legacy parity** is judged against `app.html` running side by side, except where the PRD explicitly overrides the as-built behaviour.

### Standing regression gate (applies to every milestone from M3 onward)

- [ ] `npm run build` and `npm run lint` pass with zero errors.
- [ ] Existing Risk Register, Administration and Site Administration behaviour is unchanged (or changed only as the milestone specifies).
- [ ] Any object touched by the milestone has been retested against `ARCHITECTURE.md` §13 (regression matrix).
- [ ] No new direct `localStorage` call outside the storage adapter.
- [ ] No secret, credential or auth token added to frontend code or browser storage.

---

## Phase A — Foundations (M0–M4)

### M0 · Baseline capture and characterisation

**Goal:** freeze what "no regression" means before touching anything.

**Work**
- Run `app.html`, export a **full JSON backup** via Data Tools; commit it as the canonical QA fixture.
- Record the legacy schema version (7) and confirm the storage key `erm-risk-management-v3-state`.
- Write a written parity checklist derived from the spec's QA sections: authentication/scope, register, risk CRUD, assessment, controls/actions, dashboard/reports, administration (access, categories, BUs, attributes, users, roles, matrix, data tools).
- Capture reference screenshots of every screen in both languages and both Compact/Detailed modes.

**Acceptance criteria**
- [ ] `fixtures/legacy-state.json` exists, parses, and contains non-empty `risks` and `users` arrays.
- [ ] The parity checklist enumerates every screen, filter, widget type and admin section named in the spec.
- [ ] Screenshot set covers EN and KA for all routes.
- [ ] The legacy app can be restored from the fixture by Import with zero data loss.

---

### M1 · Toolchain and project skeleton

**Goal:** a buildable, lintable, typed shell with the directory boundaries of `ARCHITECTURE.md` §2 — and nothing else.

**Work**
- Confirm the Vite + React 19 + TypeScript 6 + ESLint 10 baseline already in `package.json`.
- Add the dependencies the architecture implies but that are not yet installed: router, session/UI store, server-state/query layer, test runner (Vitest + Testing Library), and Playwright for end-to-end.
- Create the module layout: `src/app` (routes/shell), `src/features/*`, `src/domain/*`, `src/data/*` (repository + adapters), `src/i18n`, `src/ui` (design-system primitives), `src/config`.
- Add strict lint boundaries: a rule or CI check forbidding `localStorage` outside `src/data/`, and forbidding domain imports from React.
- Wire CI: install → lint → typecheck → unit tests → build.

**Acceptance criteria**
- [ ] `npm run dev`, `npm run build`, `npm run lint` all succeed on a clean clone.
- [ ] `tsc -b` passes with the existing strict flags (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`).
- [ ] A deliberately added `localStorage.getItem` in `src/features/` fails lint/CI; the same call in `src/data/` passes.
- [ ] CI runs green on an empty-app commit.

---

### M2 · Domain types and the AppState contract

**Goal:** every entity in `ARCHITECTURE.md` §3 exists as a TypeScript type, with no UI and no storage attached.

**Work**
- Define `AppState`, `Risk`, `Score`, `Control`, `RemediationAction`, `Acceptance`, `HistoryItem`, `AuditEvent`, `Category`, `BusinessUnit`, `CustomAttribute`, `User`, `Role`, `Matrix`, `SavedView`, `Dashboard`, `Widget`, `ReportTemplate`, `ReportSection`, `Branding`, `SsoConfig`, `SiteContent`.
- Encode enums as literal unions (response types, statuses, control type/automation/effectiveness, action status/priority, outlook, permission levels, module names, widget types).
- Write a runtime validator/parser for `AppState` used by import and by the migration layer.
- Define `schemaVersion = 8` and the seed state (default roles, demo users, 5 Level-1 / 38 Level-2 categories, default BU tree, default matrix and colours, default dashboard, default report, default site content).

**Acceptance criteria**
- [ ] Every field and rule in `ARCHITECTURE.md` §3 is represented; a reviewer can map each spec table row to a type member.
- [ ] `Score.impact` and `Score.likelihood` are `1|2|3|4|5`; **no `score` or `rating` field exists on any persisted type.**
- [ ] The validator accepts `fixtures/legacy-state.json` (after migration) and rejects malformed JSON, missing `risks`, and missing `users`.
- [ ] Seed state produces exactly 7 default roles with the permission matrix of `ARCHITECTURE.md` §5.2, verified by unit test.

---

### M3 · Storage layer — repository + localStorage adapter + migration

**Goal:** the replaceable data-access layer, with real legacy data flowing through it.

**Work**
- Implement `AppRepository` exactly as specified: `getState`, `saveState`, `reset`, `exportJson`, `importJson`.
- Implement `LocalStorageRepository`: read JSON → seed when missing → migrate old schema → repair invalid references → persist at schema 8. Key stays `erm-risk-management-v3-state`.
- Implement the migration/repair table from `ARCHITECTURE.md` §4.1, idempotently.
- Implement `AppDataContext` with the single mutation pipeline (clone → mutate → history/audit → save → publish).
- Stub `ApiRepository` against the same interface; select the adapter from configuration only.

**Acceptance criteria**
- [ ] Importing `fixtures/legacy-state.json` (schema 7) migrates to 8 with **identical counts** of risks, controls, actions, history items and audit events, and identical risk IDs and references.
- [ ] Running migration twice produces a byte-identical result (idempotence test).
- [ ] Each repair case has a unit test: missing Super Admin role/user; flat BUs; self-parent; cycle; missing parent; user referencing a deleted BU; Saved View missing columns/mode; missing dashboards/reports/site content; incomplete matrix.
- [ ] Invalid JSON and structurally invalid JSON both leave state **unchanged** and surface an error.
- [ ] Export → clear storage → import round-trips to an equal state.
- [ ] Switching the configured adapter to the `ApiRepository` stub changes no code outside `src/config` and `src/data`.

---

### M4 · Risk engine, permission engine and BU tree (pure domain)

**Goal:** all calculation and authorization logic exists as pure, unit-tested functions before any screen consumes it.

**Work**
- Risk engine: `score = impact × likelihood`; `rating = matrix[impact][likelihood]` by **exact cell**; `color = ratingColors[rating]`.
- Trend helpers: historical trend, direction to target; outlook passthrough (never computed).
- Reference generator with the `ERM` fallback and no sequence reuse.
- Permission engine: `max()` aggregation across roles per module; the five-gate decision function; record-visibility rules per named role; field-level partial-update merge for Control/Action Owners.
- BU tree helpers: descendants, ancestors, full path, flatten for picker, effective scope, cycle detect/repair.
- Overdue rule: `dueDate < today AND status != Completed`.

**Acceptance criteria**
- [ ] **All 25 matrix cells** resolve to the configured rating, asserted cell by cell against the 2026 default table.
- [ ] Spec examples pass: `2 × 3 = 6 → Medium`; `5 × 4 = 20 → Significant`.
- [ ] Changing one matrix cell changes only that cell's rating and every consumer that reads it — verified by a test that recalculates a fixture set.
- [ ] Effective-scope tests prove: parent grant includes all descendants; child grant excludes parent and siblings; a *future* child added under a granted parent is included automatically.
- [ ] Permission aggregation returns the highest level across multiple roles for every module.
- [ ] Reference generator produces `TECH-001`, then `TECH-002`; uses `ERM` when the BU code is blank; never reuses a number.
- [ ] Trend: `<2 snapshots → New`; lower → Improving; higher → Worsening; equal → Stable. Direction to target covers all three branches.
- [ ] Zero React or storage imports anywhere in `src/domain` (enforced by lint).

---

## Phase B — Application shell and core module (M5–M9)

### M5 · Shell, branding, i18n and routing

**Goal:** the frame every feature mounts into, matching the existing design system.

**Work**
- Route table for `/app/dashboard`, `/app/register`, `/app/risks/:id`, `/app/reports`, `/app/administration`, plus the public site and Website Administration.
- Route guards wired to the permission engine (module + route gates).
- Layout: AIZEN cotton-flower logo top-left, client logo top-right, **ADMINISTRATION entry point bottom-left**.
- Palette tokens: `#1A2151` primary, `#0D1128` surface, white accent; rating colours from configuration, not hard-coded.
- i18n with runtime EN ⇄ KA toggle and **empty-Georgian → English fallback**.
- Route transitions with scroll-to-top, reduced under `prefers-reduced-motion`.

**Acceptance criteria**
- [ ] Every route renders; an unauthorised route returns access-denied/redirect rather than a blank screen.
- [ ] Toggling language switches all chrome labels; a master-data record with an empty `*Ka` label falls back to its English value instead of rendering blank.
- [ ] Brand colours come from tokens — grepping the codebase finds no duplicated hard-coded rating hex outside the matrix config.
- [ ] The Administration entry point is present bottom-left and visible **only** to Administrator/Super Administrator.
- [ ] With `prefers-reduced-motion: reduce`, route animation is reduced or absent.
- [ ] Keyboard-only navigation reaches every nav control with a visible focus ring.

---

### M6 · Authentication and session (Phase 1 parity)

**Goal:** the existing local login, unchanged in behaviour, on the new architecture — the base that M13 hardens.

**Work**
- Normalized-email lookup → `Active` status check → Phase 1 credential check → session reference → restore on refresh → logout clears it.
- Session-scoped role/permission loading into the UI store.
- Login/logout/failed-attempt audit events.

**Acceptance criteria**
- [ ] Each demo user logs in and the correct role loads into the session.
- [ ] Invalid credentials produce an error and no session.
- [ ] Session survives a page refresh; logout clears it.
- [ ] An **Inactive** user cannot log in.
- [ ] Admin sees the Administration panel; Risk Owner, Control Owner, Action Owner and Auditor do not.
- [ ] Auditor sees no edit/save controls anywhere.
- [ ] The Phase 1 security limitations are documented in-repo and not presented as production security.

---

### M7 · Risk Register (read path)

**Goal:** the register list, driven exclusively by `visibleRisks(currentUser)`.

**Work**
- Table with Compact and Detailed modes; equal-sized Inherent/Residual/Target chips rendering `Score | Rating | Impact × Likelihood` in Detailed.
- Search across reference, title, cause, event, consequence, category name, BU name **and full hierarchy path**, risk owner name, action title — case-insensitive.
- Filters: category (Level 1), Business Unit (selected + descendants), residual rating, status, outlook.
- Sorting: title, owner, residual score, target date; default reference ascending; header click toggles direction.
- Column visibility panel; custom attributes with `showInRegister = true` join the selectable columns automatically.
- Role-aware empty state; zero-result state with a clear-filters action; New Risk button only for users with create rights.

**Acceptance criteria**
- [ ] Each role sees exactly the risk set defined in `ARCHITECTURE.md` §5.3.
- [ ] A hidden risk cannot be surfaced by search **or** by direct URL.
- [ ] Every documented search field matches; case-insensitivity verified.
- [ ] Each filter works alone and in combination; the BU filter includes descendants **and excludes parents and siblings**.
- [ ] Sorting toggles direction on repeated header clicks; default sort is reference ascending.
- [ ] All rating chips read from the risk engine — changing a matrix cell updates the register with no code change.
- [ ] Empty and no-result states render distinctly; New Risk is hidden for users without create rights.

---

### M8 · Risk Editor and the write path

**Goal:** create and update risks under full validation, history and audit rules.

**Work**
- Six tabs: Basic, Structured Description, Assessments, Controls, Actions, Custom Fields.
- Cloned-draft editing; save workflow per `ARCHITECTURE.md` §8.2.
- Validation, data cleaning, history-on-score-change, audit-on-every-save.
- Owner candidate lists filtered by active status, role capability and BU effective scope.
- Default values for a new risk exactly as specified (BU, category, owner, dates, status `Draft`, type `Current`, response `Mitigate`, outlook `Stable`, inherent 3×3, residual 2×3, target 2×2, empty controls/actions, custom number 0 / others `''`).
- Field-level partial update: Control/Action Owner saves restore protected fields from the original record.

**Acceptance criteria**
- [ ] Save is blocked for: empty title; no category; no risk owner; empty cause/event/consequence; `Accept` without rationale; `Accepted` without approver/approval date/valid until.
- [ ] Generated reference is correct and recalculates when the BU changes on a **new** risk but never on an existing one.
- [ ] Cancel or modal close persists nothing.
- [ ] A score change appends exactly one history item; a title/status/control/action-only change appends **none** — but still appends an audit event.
- [ ] Audit `changes` lists changed master fields, score transitions, control/action changes, or the `Record saved` fallback.
- [ ] Title is trimmed; controls/actions with empty titles are dropped on save; custom values stay keyed by attribute ID.
- [ ] A Control Owner save cannot alter risk master data, assessments or another owner's controls — asserted by crafting a payload with extra fields and confirming they are discarded.
- [ ] Owner dropdowns exclude inactive users and users outside the selected BU's effective scope.
- [ ] Only Super Administrator, Administrator and Risk Manager with `risks: edit` can create a risk.

---

### M9 · Individual Risk View

**Goal:** the read-only detail surface with all five tabs.

**Work**
- Header band: reference/title, category/BU, risk owner, action-owner context, three scores, target date, status.
- Overview: Cause/Event/Consequence cards, status narrative, response/review date/risk type, Historical Trend, Direction to Target, 12-month Outlook, Existing Controls summary, Remediation Actions table (Action, Description, Deliverable, Status, Deadline, Action Owner), acceptance summary when response = Accept.
- Assessment tab: three score cards, three 5×5 matrices with the selected cells, impact/likelihood guidance, history table, residual trend chart.
- Controls, Actions, and Trend & Audit tabs.

**Acceptance criteria**
- [ ] All five tabs render for a fully-populated risk and for a minimal risk with no controls/actions.
- [ ] Trend, Direction to Target and Outlook are displayed as **three separate indicators** and Outlook is never overwritten by the computed trend.
- [ ] The three matrices highlight the correct cells and derive colours from configuration.
- [ ] The acceptance summary appears only when response = Accept.
- [ ] Trend & Audit lists risk-specific events newest-first with actor, timestamp, summary and change labels.
- [ ] Opening a risk the current user cannot see yields access-denied/not-found.

---

## Phase C — Administration (M10–M12)

### M10 · Risk Administration — master data

**Goal:** Categories, Business Units and Custom Attributes, with the OU tree fully correct.

**Work**
- Administration shell with the ten sections and the Overview metrics.
- Categories: add/edit/activate/deactivate, bilingual labels, English required.
- Business Units: tree UI with expand/collapse, add root, add child, edit, active toggle, hierarchy path, direct user count, directly scoped risk count, descendant count; parent validation.
- Custom Attributes: five types, comma-separated select options (trimmed, empties dropped), `active`, `showInRegister`.

**Acceptance criteria**
- [ ] Overview counts match the formulas in `ARCHITECTURE.md` §8.5.
- [ ] Category save is blocked when English labels are empty; deactivating a used category leaves old risks resolving its label.
- [ ] BU save is blocked for: duplicate code; self as parent; a descendant as parent (cycle); empty required name/code.
- [ ] Inherited scope is correct in the user editor: inherited units show as `Inherited`, cannot be individually unchecked while the parent grant is active, and direct vs effective counts are shown separately.
- [ ] **Sibling and parent access is not leaked** — asserted with the Technology Division / Information Security / IT Operations fixture.
- [ ] All five custom-attribute types render in the editor; select options parse correctly; values persist on the risk; `showInRegister` adds the column; deactivation hides the field **without deleting stored values**, and reactivation restores them.
- [ ] Every change in this milestone writes an audit event.

---

### M11 · Users, Roles and the Rating Matrix

**Goal:** the authorization configuration surface.

**Work**
- User editor: name/email/password/title/status, multi-role, direct BU scopes, effective-scope preview.
- Roles & Permissions: the eight-module matrix, custom role creation with EN/KA names and description.
- Rating Matrix editor: 25 cells, four rating colours, Restore 2026 defaults.

**Acceptance criteria**
- [ ] User save is blocked when name, email, role or BU scope is missing.
- [ ] An inactive user cannot log in and does not appear in any owner picker, while historical owner and audit references remain readable.
- [ ] Effective-scope count in the user editor matches the domain helper.
- [ ] A custom role can be created and edited; effective permission across multiple roles is the maximum per module.
- [ ] Routes and buttons match the effective permission, and record-level scope is still enforced on top of it.
- [ ] Every one of the 25 matrix cells is editable; colour changes propagate to register chips, detail cards, heatmaps, distributions, reports and rating filters.
- [ ] **Restore defaults reproduces the 2026 table and colours exactly** (`#00B050`, `#FFF200`, `#FFB900`, `#F32121`).
- [ ] Score remains `Impact × Likelihood` regardless of matrix edits; matrix-driven filters and heatmaps stay consistent.

---

### M12 · Branding, SSO draft, Data Tools and Site Administration

**Goal:** the remaining admin sections plus the preserved public-site CMS.

**Work**
- Branding: client logo upload (base64 in Phase 1), restore on refresh, remove → placeholder; keep AIZEN brand assets out of Risk Administration scope.
- SSO/SAML roadmap section: all draft fields; the Enabled toggle raises an audit event.
- Data Tools: Export full JSON, Import JSON, Reset demo data (confirmation required), Export audit JSON.
- Site Administration (Super Admin only): public site, About Us, solutions, team members, demo media — **preserved and improved without removing capability**.

**Acceptance criteria**
- [ ] Client logo uploads, persists across refresh, and removes back to the placeholder; an oversized image produces a clear error rather than a silent failure.
- [ ] A Risk Administrator can change the client logo but **cannot** reach Website Administration; only Super Administrator can.
- [ ] Export produces valid JSON containing every collection listed in `ARCHITECTURE.md` §4.2.
- [ ] Import accepts the current schema and the legacy schema-7 fixture; invalid import leaves state unchanged.
- [ ] Reset requires confirmation and restores the seed exactly.
- [ ] Audit export is valid JSON.
- [ ] Every Site Administration capability present in `app.html` still works; the parity checklist for this page is fully green.

---

## Phase D — Reporting (M13–M14)

*M13 and M14 may run in parallel with each other once M7–M9 are complete.*

### M13 · Dashboard Builder

**Work**
- Dashboard CRUD (add, edit metadata, duplicate, delete, shared toggle, accent colour, EN/KA name and description).
- Seven filters persisted in the definition and restored on open.
- Seven widget types with full configuration (titles, colours, span, score basis, grouping, metric type, limit, add/duplicate/remove/reorder).

**Acceptance criteria**
- [ ] All seven widget types render with real data.
- [ ] The six metric rules compute exactly as specified (Total, Open, Significant Residual, Overdue Actions, Emerging, Completed Actions).
- [ ] Filters are saved and restored on reopen.
- [ ] Colour, span, reorder and duplicate all persist; duplicate creates a new ID and an independent widget collection.
- [ ] **Deleting the last remaining dashboard is blocked.**
- [ ] Deleting a dashboard removes report sections bound to it, leaving no broken references.
- [ ] Widgets read ratings from the shared risk engine — a matrix change updates heatmaps and distributions with no code change.

---

### M14 · Report Template Builder and export

**Work**
- Template CRUD with EN/KA name and description.
- Three section types: Dashboard, Open Text, Compact Risk Register — each with independent filters.
- Section lifecycle: add, move up/down, duplicate, delete.
- Print/PDF via the browser print view.
- Register CSV and SpreadsheetML `.xls` export including active custom attributes.

**Acceptance criteria**
- [ ] All three section types add, configure, move, duplicate and delete independently.
- [ ] A Compact Register section **cannot be reduced to zero columns**.
- [ ] Two dashboard sections in one report can carry different scopes and render differently.
- [ ] Print/PDF view opens cleanly with correct pagination and no clipped chips.
- [ ] CSV contains the current filtered dataset with commas, quotes and newlines correctly escaped.
- [ ] `.xls` export opens in Excel and includes active custom attributes.
- [ ] Export reflects only the current user's visible, filtered records.

---

## Phase E — Security hardening (M15–M16)

### M15 · Google Sign-In with internal authorization

**Prerequisite:** a server-side endpoint exists (may be the minimal API introduced with M17, or a thin auth service ahead of it) — the PRD forbids doing this purely in the browser.

**Work**
- Inspect the current auth architecture, user schema, permission model, API layer and session logic; identify compatibility and security risks; present a short implementation plan before coding (PRD implementation process).
- Extend the user record with account status, assigned role, assigned permissions and the Google `sub` after linking.
- Authorization Code flow with PKCE; server-side ID-token validation of signature, issuer, audience, expiry and nonce; `state` + `nonce` + PKCE against CSRF and replay.
- Server session: HttpOnly, Secure, SameSite cookie; session ID rotated after login.
- Add the Sign in with Google button to the existing login page without changing the design system.

**Acceptance criteria**
- [ ] An active, pre-provisioned user with a verified Google email signs in successfully.
- [ ] That user receives **exactly** the internally configured role and permissions — nothing derived from the Google profile.
- [ ] An unknown Google account is denied.
- [ ] A disabled internal user is denied.
- [ ] An unverified Google email (`email_verified !== true`) is denied.
- [ ] Invalid, expired, replayed and incorrectly-issued tokens are all rejected.
- [ ] **No user is auto-created** by Google authentication.
- [ ] An `@aizzen.com` address with no internal record is denied.
- [ ] Changing or removing an internal user's permissions takes effect without touching their Google account.
- [ ] Disabling or deleting an internal user immediately prevents further access.
- [ ] Access-denied messages are generic and do not reveal whether an email is registered.
- [ ] No client secret, access token or sensitive config appears in frontend code; **no auth token is written to `localStorage`.**
- [ ] Login rate limiting is active; successful logins, failures, linking events and denials are all audited.
- [ ] Existing authentication, Administration, Risk Register and Site Administration functionality is regression-free.

---

### M16 · Security and quality validation

**Work**
- OWASP Top 10 pass over the application: input validation, output encoding, access control, injection, insecure design, misconfiguration, vulnerable dependencies, identification/authentication failures, integrity, logging and monitoring.
- CSP and security headers; dependency scanning in CI.
- Authorization test suite executed per role against every route and every mutation.
- Accessibility audit against the spec baseline.

**Acceptance criteria**
- [ ] Every route and every mutation is exercised by an automated test for each of the 7 default roles; unauthorised attempts are denied without state mutation.
- [ ] Auditor cannot trigger any mutation through the UI or by crafted request.
- [ ] Dependency scan reports no known high/critical vulnerabilities.
- [ ] CSP is enforced with no console violations in normal use.
- [ ] Accessibility: every interactive control has a visible label or `aria-label`/`title`; focus is always visible; no rating or status is conveyed by colour alone; dialogs close via Cancel/Close without losing focus.
- [ ] Phase 1 residual risks are documented explicitly (localStorage readable, local passwords, tamperable audit) with their Phase 2 mitigations named.

---

## Phase F — Backend readiness (M17–M18)

### M17 · ApiRepository and the on-prem / S3 configurations

**Goal:** make all three storage configurations real and interchangeable.

**Work**
- Complete `ApiRepository` against the same interface: HTTP implementation, normalized DTO mapping, auth/session error handling, optimistic update and query invalidation.
- On-prem configuration pointed at a locally hosted repository API.
- AWS configuration where the browser talks only to the application API and the API holds IAM credentials from a secrets manager for S3 access.
- Configuration-driven adapter selection.

**Acceptance criteria**
- [ ] The same UI build runs against localStorage, on-prem API and AWS-backed API by configuration change alone — **no business-logic or component change**.
- [ ] All three configurations satisfy an identical contract test suite against `AppRepository`.
- [ ] **No AWS credential is present in any frontend bundle** — verified by scanning the built output.
- [ ] Auth/session errors from the API surface as the documented HTTP mapping (401/403/404/409/422/429/500).
- [ ] Transactional risk data lives in a relational store; S3 is used only for evidence, media, exports, snapshots and audit archive.

### M18 · Backend cutover readiness

**Work**
- Server-side authoritative behaviour: authentication/session, RBAC and record-level authorization (union of grants, decided server-side), matrix calculation and versioning, validation, status transitions, acceptance approvals, transactional audit ledger, concurrency control, backup/restore.
- Optimistic versioning with `If-Match` and 409 on stale writes.
- Migration script: validate → normalize → create organization → master data → users/roles/scopes → risks and children → dashboards/reports/saved views → source-ID traceability → reconciliation report → encrypted archive of the original JSON.

**Acceptance criteria (Definition of Done for cutover)**
- [ ] The UI runs on `ApiRepository` in production.
- [ ] All writes are server-validated; a client-supplied rating is never authoritative.
- [ ] Role and scope tests pass **against the API**, independently of the UI.
- [ ] Multi-role record visibility resolves as a **union** of grants, fixing the Phase 1 named-role-precedence limitation.
- [ ] SSO session works end to end.
- [ ] Matrix versioning works and approved historical assessments stay pinned to their matrix version.
- [ ] Risk owner, assessment, control and action history is retained.
- [ ] Immutable audit records are created inside the same transaction as their mutation; a failed audit insert rolls the mutation back.
- [ ] The local JSON migration reconciles counts against the reconciliation report with zero discrepancies.
- [ ] Backup/PITR restore has been tested.
- [ ] Evidence storage is secured.
- [ ] Performance and security tests pass.
- [ ] **No production credential or data remains in `localStorage`.**

---

## Dependency map

```
M0 ─ M1 ─ M2 ─ M3 ─ M4 ─┬─ M5 ─ M6 ─ M7 ─ M8 ─ M9 ─┬─ M13 ─┐
                        │                          └─ M14 ─┤
                        └─ M10 ─ M11 ─ M12 ─────────────────┤
                                                            └─ M15 ─ M16 ─ M17 ─ M18
```

M13/M14 may run in parallel once M9 lands. M10–M12 may start once M5 lands, in parallel with M7–M9, provided both branches share the M4 domain layer without forking it.

---

## Open decisions that can block later milestones

These come from the spec's own open-questions list. Each needs a Product/Risk answer before the milestone in brackets can be finalised:

| # | Decision | Blocks |
|---|---|---|
| 1 | Exact status-transition matrix for Risk / Assessment / Acceptance | M8, M18 |
| 2 | Approval authorities by rating and Business Unit | M18 |
| 3 | Must a Completed action always have progress = 100? | M8 |
| 4 | May Residual be lower than Target or Inherent in all cases? | M8 |
| 5 | May a Risk Owner **create** controls/actions, or only update them? | M8 |
| 6 | Multiple-role record-visibility union rules | M4 (documented), M18 (enforced) |
| 7 | Category/attribute deletion and remapping policy | M10 |
| 8 | Risk register uniqueness rule for titles | M8 |
| 9 | Evidence attachment taxonomy and retention | M17 |
| 10 | KRI / Risk Appetite module scope | out of current scope |
| 11 | Reporting period freeze/snapshot rules | M14 |
| 12 | Notification/reminder frequency | M18 |

Until answered, implement documented Phase 1 behaviour and keep the Phase 2 control labelled separately — do not silently invent a rule.
