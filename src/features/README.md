# `src/features` — feature modules

One directory per feature area, each owning its screens, components and local form state. See `ARCHITECTURE.md` §8 (module boundaries).

**Planned modules**

| Directory | Covers | Milestone |
|---|---|---|
| `auth/` | login, session handling, Google Sign-In button | M6, M15 |
| `register/` | Risk Register list, search, filters, columns, saved views, export | M7 |
| `risk-editor/` | six-tab risk editor and the save workflow | M8 |
| `risk-view/` | Individual Risk View, five tabs | M9 |
| `dashboards/` | Dashboard Builder, seven widget types | M13 |
| `reports/` | Report Template Builder, three section types | M14 |
| `administration/` | the ten Risk Administration sections | M10–M12 |
| `site-admin/` | Website Administration (Super Admin only) | M12 |
| `public-site/` | the public AIZEN website — home and About Us, rendered from `siteContent` | M12 |

**Boundary**

- **May** import from `src/domain`, `src/ui`, `src/i18n`, `src/config`, and the data context exposed by `src/data`.
- **May not** touch `localStorage` / `sessionStorage` — lint-enforced. All persistence goes through the repository.
- **May not** reimplement rating, scope or permission logic. Call `src/domain`.
