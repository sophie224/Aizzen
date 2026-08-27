# Fixtures

## `auth-directory.dev.json`

The internal user directory the auth service checks during Google sign-in (`server/directory.ts`, ARCHITECTURE.md §6.2). Google identities are never auto-provisioned, so an address absent from this file is refused with `noInternalUser`.

| | |
|---|---|
| Source | generated from `createSeedUsers()` — the same factory the SPA seeds AppState from |
| Shape | `{ users: [...] }` — `User` minus `password` |
| Regenerate | `npm run auth:directory` (also run automatically by `npm run auth`) |
| Consumed by | `USER_DIRECTORY_PATH`, default in `server/config.ts` |

Generated rather than hand-written because the session cookie carries a **user ID** that the SPA re-resolves against AppState: the directory and the seed must agree on emails *and* IDs, or a successful Google login lands on a user the app cannot find. `server/directory-snapshot.test.ts` fails if the two drift apart.

Do **not** point `USER_DIRECTORY_PATH` at `legacy-state.json` — that fixture is the frozen v7 parity baseline with different addresses and no `usr_admin_sp`. Once AppState has diverged from the seed (users added through Administration), export it from Administration → Data Tools and point `USER_DIRECTORY_PATH` at the export.

## `legacy-state.json`

The frozen legacy dataset — the **canonical baseline for the refactor**. It defines what "no regression" means (PLAN.md M0).

| | |
|---|---|
| Source | the single-file v7 build (AIZEN Risk & Compliance 4.1.0), since removed from the repository |
| Schema version | 7 |
| Storage key | `erm-risk-management-v3-state` |
| Shape | `{ exportedAt, app, schemaVersion, state }` — identical to Data Tools → *Export full JSON backup* |
| Size | ~76 KB |

### Contents

| Collection | Count |
|---|---|
| Users | 8 |
| Roles | 7 |
| Categories | 38 (5 Level-1 groups) |
| Business units | 7 |
| Custom attributes | 3 |
| Risks | 8 |
| Controls (nested) | 6 |
| Remediation actions (nested) | 10 |
| Assessment history items (nested) | 13 |
| Risk-scoped audit events (nested) | 3 |
| Global audit events | 4 |
| Matrix cells | 25 |
| Dashboards | 1 |
| Report templates | 1 |
| Saved views | 0 |

Risk references: `IT-001`, `IT-002`, `PPL-001`, `IT-003`, `LRC-001`, `IT-004`, `IT-005`, `LRC-002`.

These counts are asserted in `src/domain/validation/baseline-fixture.test.ts`. **M3's migration must preserve every one of them**, along with the risk IDs and references.

### How it was produced

A generator script (`scripts/extract-legacy-baseline.mjs`, removed alongside the legacy build) ran the legacy `ERM.createSeedState()` factory in an isolated Node VM context, using two line ranges lifted from the v7 single-file build (the ERM helper header, and the seed namespace). Neither range touched the DOM, React or `localStorage`, so no browser was required.

The result is equivalent to loading the v7 build in a clean browser profile and exporting immediately: it seeded this exact state when storage was empty, and *Reset demo data* restored it.

**One deliberate change.** The legacy `uid()` drew on `Date.now()` and `Math.random()`, so audit-event IDs differed on every run. The script pinned the generator to a counter (`audit_baseline_0001`, …), making the fixture byte-stable so migration tests can assert exact equality. The IDs are opaque, and cross-references between `globalAudit` and `risk.audit` remain consistent because both read the same call.

### Regenerating

**Not regenerable.** The legacy build and its extraction script are no longer in the repository, so this fixture is frozen — treat it as the committed contract. The counts above are asserted by tests; changing them by hand invalidates the parity evidence gathered against the baseline. Recovering the generator would mean restoring both files from git history (`git log --diff-filter=D -- legacy/app.html`).
