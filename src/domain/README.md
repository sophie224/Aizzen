# `src/domain` — pure business logic

Framework-free, I/O-free functions and types. This is the layer that must stay reusable server-side at the Phase 2 cutover, so it is kept deliberately sterile. See `ARCHITECTURE.md` §2.1 and §7.

**Planned contents**

| Module | Responsibility | Milestone |
|---|---|---|
| `types/` | `AppState`, `Risk`, `Score`, `Control`, `Action`, `Acceptance`, roles, matrix, etc. | M2 |
| `risk-engine/` | `score = impact × likelihood`, exact-cell rating lookup, rating colour | M4 |
| `trend/` | historical trend, direction to target | M4 |
| `permissions/` | module aggregation (`max` across roles), five-gate decision, record visibility, field-level merge | M4 |
| `business-units/` | descendants, ancestors, path, flatten, effective scope, cycle detect/repair | M4 |
| `reference/` | risk reference generation (`<BU CODE>-<3-digit>`, `ERM` fallback) | M4 |
| `validation/` | risk, user, category, business-unit and matrix validators | M2, M4 |

**Boundary — lint-enforced**

- **May not** import `react`, `react-dom`, `react-router-dom`, `zustand` or `@tanstack/*`.
- **May not** import from `src/app`, `src/features`, `src/ui` or `src/data`.
- **May not** perform I/O, touch storage, read the clock implicitly, or hold state.

Pass `today` in as an argument rather than calling `new Date()` inside a rule — it keeps the overdue and default-date logic testable.

**Rule:** every calculation the UI displays originates here. Duplicated rating logic in a component is a defect (`ARCHITECTURE.md` §7).
