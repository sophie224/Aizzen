# `src/config` — application configuration

Build- and environment-level configuration. Above all, **which storage adapter the application runs against**.

The PRD requires three interchangeable storage configurations — localStorage, on-premises API, AWS S3 — that share one data contract and are *"selectable through configuration without requiring changes to the application's business logic"* (`ARCHITECTURE.md` §4). This directory is that selection point.

**Rules**

- Switching adapters must touch **only** this directory and `src/data`. If a change here forces a change in `src/features` or `src/app`, the abstraction has leaked.
- **No secrets.** No Google client secret, no AWS credential, no access token, no API key. Anything in this directory ships to the browser in the bundle. Secrets live in server-side environment variables or a secrets manager (`ARCHITECTURE.md` §6.2, §11).
- Only non-sensitive, publishable values belong here: the active adapter name, API base URL, feature flags, the Google OAuth **client ID** (public by design — the *secret* never leaves the server).

**Planned contents:** adapter selection, environment schema and parsing, feature flags.
