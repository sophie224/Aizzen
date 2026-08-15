# `src/i18n` — bilingual support

Runtime English ⇄ ქართული toggle. See `ARCHITECTURE.md` §9.

**Rules**

- Every master-data label is a pair: `*En` (required) and `*Ka` (optional).
- **When the Georgian value is empty, fall back to the English value** — never render blank.
- User-entered risk narratives (cause, event, consequence, status narrative) are *not* translated automatically and may remain in a single language.
- The active language is UI state, held in the session store — not business data in `AppState`.

**Planned contents:** translation dictionaries for UI chrome, the language provider and hook, and the bilingual-label resolver used by master data.
