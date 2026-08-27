/*
 * Generates the development user directory the auth service reads
 * (ARCHITECTURE.md §6.2).
 *
 * WHY THIS EXISTS. `authorizeGoogleIdentity` never auto-provisions: a Google
 * identity may enter only when an ACTIVE internal user with the same
 * normalised email already exists, and the session cookie then carries that
 * user's ID, which the SPA re-resolves against AppState. So the service's
 * directory and the app's seed must agree on BOTH emails and IDs. Pointing the
 * service at `fixtures/legacy-state.json` broke that: it is the frozen v7
 * parity baseline, with different addresses and no `usr_admin_sp` at all, so
 * every seeded administrator was refused with `noInternalUser`.
 *
 * Deriving the snapshot from `createSeedUsers()` — the same factory the SPA
 * seeds from — makes drift impossible by construction.
 *
 * Passwords are deliberately dropped: the auth service authenticates through
 * Google and has no business holding the Phase 1 demo credentials.
 *
 * PHASE 1 ONLY. When AppState in the browser has diverged from the seed (users
 * added through Administration), export it from Administration → Data Tools
 * and point USER_DIRECTORY_PATH at that file instead.
 */

import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createSeedUsers } from '../src/data/seed/organisation.ts'
import type { User } from '../src/domain/types/index.ts'

/** The directory needs identity and status — never the demo password. */
type DirectoryUser = Omit<User, 'password'>

const OUTPUT_PATH = new URL('../fixtures/auth-directory.dev.json', import.meta.url)

export function buildAuthDirectory(): { users: DirectoryUser[] } {
  const users = createSeedUsers().map((user): DirectoryUser => {
    // Copied field by field rather than by rest-spread, so a new secret added
    // to `User` cannot reach the snapshot unnoticed.
    const entry: DirectoryUser = {
      id: user.id,
      name: user.name,
      title: user.title,
      email: user.email,
      status: user.status,
      roleIds: [...user.roleIds],
      businessUnitIds: [...user.businessUnitIds],
    }
    if (user.googleSub !== undefined) entry.googleSub = user.googleSub
    return entry
  })

  return { users }
}

async function main(): Promise<void> {
  // Stable output: no timestamp, so regenerating an unchanged seed is a no-op
  // diff and the committed snapshot stays reviewable.
  const contents = `${JSON.stringify(buildAuthDirectory(), null, 2)}\n`
  await writeFile(OUTPUT_PATH, contents, 'utf8')
  process.stdout.write(`Wrote ${OUTPUT_PATH.pathname}\n`)
}

// Only the CLI entry point writes; the builder itself stays importable in tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
