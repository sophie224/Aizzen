# `src/app` — application shell

The route table, layout chrome and route guards. See `ARCHITECTURE.md` §2 (layers) and §8.1 (routes).

**Contains**

- Route definitions for `/app/dashboard`, `/app/register`, `/app/risks/:id`, `/app/reports`, `/app/administration`, the public site, and Website Administration.
- Route guards that call the permission engine in `src/domain`.
- Layout chrome: AIZEN logo top-left, client logo top-right, ADMINISTRATION entry point bottom-left.
- Providers (data context, query client, i18n, router).

**Does not contain**

- Business rules — those live in `src/domain`.
- Feature screens — those live in `src/features`.

**Boundary:** may import from every other layer.
