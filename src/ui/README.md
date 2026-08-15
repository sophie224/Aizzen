# `src/ui` — design-system primitives

Shared, presentational building blocks. See `ARCHITECTURE.md` §9.

**Brand tokens**

| Token | Value |
|---|---|
| Primary navy | `#1A2151` |
| Surface dark navy | `#0D1128` |
| Accent | white |

Risk rating colours (`Low`, `Medium`, `High`, `Significant`) are **not** tokens here — they are read from the configured rating matrix at runtime, so an administrator's colour change propagates everywhere (`ARCHITECTURE.md` §7).

**Accessibility baseline — applies to every primitive**

- Every interactive control has a visible label or `aria-label` / `title`.
- Keyboard focus is always visible.
- Colour alone never carries meaning — rating and status text is always rendered alongside the colour.
- Dialogs close via Cancel/Close without losing focus.
- Motion is reduced or removed under `prefers-reduced-motion`.

**Boundary**

- **May** import from `src/i18n` and `src/domain` types.
- **May not** import from `src/features`, `src/app` or `src/data` — primitives stay presentational and reusable.
