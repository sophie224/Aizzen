# Fixtures

## `legacy-state.json`

The frozen legacy dataset — the **canonical baseline for the refactor**. It defines what "no regression" means (PLAN.md M0).

| | |
|---|---|
| Source | `app.html` (AIZEN Risk & Compliance 4.1.0, the single-file v7 build) |
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

```bash
node scripts/extract-legacy-baseline.mjs
```

The script runs the legacy `ERM.createSeedState()` factory in an isolated Node VM context, using two line ranges lifted from `app.html` (the ERM helper header, and the seed namespace). Neither range touches the DOM, React or `localStorage`, so no browser is required and the result is reproducible in CI.

This is equivalent to loading `app.html` in a clean browser profile and exporting immediately: the app seeds this exact state when storage is empty, and *Reset demo data* restores it.

**One deliberate change.** The legacy `uid()` draws on `Date.now()` and `Math.random()`, so audit-event IDs differed on every run. The script pins the generator to a counter (`audit_baseline_0001`, …), making the fixture byte-stable so migration tests can assert exact equality. The IDs are opaque, and cross-references between `globalAudit` and `risk.audit` remain consistent because both read the same call.

### Regenerating

Re-running the script overwrites the fixture. Only do this deliberately — the counts above are a test contract, and changing the baseline invalidates the parity evidence gathered against it. If `app.html` is ever updated, regenerate, re-run `npm run test`, and update `docs/PARITY-CHECKLIST.md` and this file together.
