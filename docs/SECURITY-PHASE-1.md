# Phase 1 Security Posture

**Status: Phase 1 is a workflow prototype, not a production security boundary.**

This document states plainly what the current build does and does not protect, so that nobody — developer, tester, reviewer or stakeholder — mistakes it for production authentication or authorisation. It is referenced from `src/domain/auth/index.ts`.

The specification is explicit on this point: *"Administration guard is client-side… Phase 1 access is workflow simulation, not a production security boundary"* and *"Phase 1 login is not production authentication."*

---

## 1. What Phase 1 does provide

| Capability | Where |
|---|---|
| Case-insensitive, whitespace-tolerant email lookup | `src/domain/auth` |
| Active-status check — an inactive account can never sign in | `src/domain/auth` |
| A single, non-discriminating failure reason | `src/domain/auth` |
| Role- and scope-aware visibility and edit rules | `src/domain/permissions` |
| Field-level merge that discards unauthorised changes | `src/domain/permissions` |
| Session restore that re-validates the user on every load | `src/app/session` |
| Audit events for sign-in, failed attempt and sign-out | `src/app/session/use-auth.ts` |

These are **correctness** guarantees for the workflow model. They are not enforced against an attacker.

---

## 2. Known limitations — accepted for Phase 1

### 2.1 Credentials

- **Passwords are stored in plain text** inside `AppState`, and compared with `===`. There is no hashing, salting or key derivation.
- Every demo password is visible to anyone who opens the JSON backup or developer tools.
- There is **no password complexity, expiry or rotation** policy.
- There is **no MFA**.

### 2.2 Attack resistance

- **No failed-attempt lockout and no rate limiting.** Credentials can be guessed without limit.
- The failed-attempt audit write is reachable **without a session**, so the audit trail can be grown by anyone with the page open. It is bounded only by browser storage quota.
- **No CSRF, replay or session-fixation protection** — there is no server to protect.

### 2.3 The trust boundary does not exist

- All state lives in `localStorage` and is **readable and writable through developer tools**. A user can grant themselves any role by editing it.
- **Every guard is client-side.** Hiding the Administration entry point is a usability affordance, not access control.
- The audit trail is **mutable** — no hash chain, no append-only storage, no delete protection.
- All seed data, including every demo credential, ships in the bundle.

### 2.4 Session

- The session reference is a **user ID in `localStorage`** under `erm-risk-management-v3-session`. It is not a token and carries no claims, but it is not protected either — setting it by hand signs you in as that user.
- No `HttpOnly`, `Secure` or `SameSite` cookie, because there is no server to issue one.
- No session expiry, revocation or concurrent-session control.

### 2.5 Data

- No encryption at rest under application control.
- Clearing browser storage destroys all data unless a JSON backup exists.
- Exports run entirely in the browser and may contain data the current user can see; there is no server-side authorisation or export audit.

---

## 3. Two deliberate divergences from the v7 build

**Session lives outside `AppState`.** The v7 build persisted `currentUserId` inside application state, which meant a full JSON backup carried a session with it — importing a colleague's backup signed you in as them. The session reference now lives under its own key and is stripped by migration.

**Failed attempts are audited.** The v7 build recorded only successful sign-ins. `PLAN.md` M6 and the PRD's security requirements both call for failed attempts, so `auth.login_failed` is written with the attempted address. **The attempted password is never recorded** — asserted by test.

---

## 3a. What the auth service now provides (M15)

`server/` runs a Fastify auth service that closes several of the gaps above **for the Google sign-in path only**. Credential sign-in remains as described in §2.

| Control | Status |
|---|---|
| Authorization Code flow with PKCE (S256) | Implemented |
| Server-side ID-token validation: signature, issuer, audience, expiry, nonce | Implemented |
| `state` (CSRF), single-use callback, nonce (replay) | Implemented |
| `email_verified` required | Implemented |
| Active pre-provisioned internal user required; **no auto-provisioning** | Implemented |
| Domain membership grants nothing | Implemented |
| Roles never derived from Google profile data | Implemented |
| HttpOnly + Secure + SameSite session cookie | Implemented |
| Session ID rotated after login (anti-fixation) | Implemented |
| Login rate limiting | Implemented |
| Generic denial message; specific reason only in the audit log | Implemented |
| Client secret server-side only, from environment | Implemented |
| No authentication token in browser storage | Implemented |

**Two Phase 1 limits remain in this path:**

1. **The user directory is a snapshot.** The service reads a JSON export of AppState (`USER_DIRECTORY_PATH`) because the authoritative directory still lives in the browser. Deactivating a user in the app does not reach the service until the snapshot is re-exported. M17/M18 removes the duplication.
2. **Account linking is not persisted.** First sign-in audits `auth.google.linked` but cannot write `googleSub` back to a read-only snapshot, so the `sub`-mismatch check only engages once a linked value exists in the exported state.

Everything in §2 still applies to credential sign-in, and the client-side guards remain client-side.

## 4. What Phase 2 must add

From `ARCHITECTURE.md` §6.2, §11 and §12. None of this can be delivered client-side.

| Area | Requirement |
|---|---|
| Identity | Google Sign-In via Authorization Code + PKCE, with **server-side** ID-token validation of signature, issuer, audience, expiry and nonce |
| Provisioning | No auto-provisioning. A matching **active** internal user must already exist; domain membership grants nothing |
| Authorisation | Roles and permissions always from the internal system, never derived from Google profile data |
| Session | `HttpOnly`, `Secure`, `SameSite` cookie; session ID rotated after login to prevent fixation |
| Secrets | Client secret and AWS credentials in environment variables or a secrets manager — never in frontend code |
| Storage | **No authentication token in `localStorage`, ever** |
| Abuse | Login rate limiting; CSRF, replay and fixation protection via `state`, `nonce` and PKCE |
| Audit | Server-side, tamper-evident, written in the same transaction as its mutation |
| Enforcement | Every endpoint recomputes access; client-supplied role or scope claims are never trusted |
| Transport | HTTPS only, CSP and security headers, dependency scanning |

---

## 5. Rules for anyone working on this build

1. **Never describe Phase 1 as secure** in code comments, UI copy, documentation or a demo.
2. **Never put real personal or business data** into a Phase 1 deployment.
3. **Never add a secret** to `src/config` or anywhere else in the frontend — everything there ships in the bundle.
4. **Never write an authentication token to browser storage**, even temporarily.
5. When adding a guard, add it in `src/domain/permissions` and call it from the UI — never inline a role check in a component.
6. The sign-in page must keep saying, visibly, that this is a demo. It currently does.
