# `src/data` — persistence

The repository interface, its adapters, the migration layer, and the application data context. See `ARCHITECTURE.md` §4.

**This is the only place in the codebase permitted to touch `localStorage` or `sessionStorage`.** The ESLint config bans those globals everywhere else; this directory carries the single override.

**Planned contents**

| Module | Responsibility | Milestone |
|---|---|---|
| `repository.ts` | the `AppRepository` interface | M3 |
| `local-storage-repository.ts` | Phase 1 adapter — key `erm-risk-management-v3-state` | M3 |
| `api-repository.ts` | Phase 2 adapter — on-prem and AWS-backed API | M3 (stub), M17 |
| `migration/` | schema migration and reference repair, idempotent | M3 |
| `seed/` | default roles, users, categories, BU tree, matrix, dashboards, site content | M2 |
| `app-data-context.tsx` | authoritative `AppState` + the single mutation transaction | M3 |

**Rules**

- The storage key `erm-risk-management-v3-state` is retained deliberately for backward compatibility. Do not rename it.
- Adapter selection is configuration-driven (`src/config`) — swapping adapters must require no change in `src/features` or `src/app`.
- Never store a derived value (score, rating, trend, effective scope, overdue flag).
- Never write an authentication token or sensitive session data to browser storage (`ARCHITECTURE.md` §6.2).
