import { buildApp } from './app.ts'
import { isGoogleClientConfigured, loadConfig } from './config.ts'

/*
 * Entry point. Run with:  npm run auth
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment.
 * Neither value is ever committed — see .env.example.
 */
const config = loadConfig()

// Said at boot rather than discovered as a Google 400 mid-login.
if (!isGoogleClientConfigured(config)) {
  process.stderr.write(
    'WARNING: GOOGLE_CLIENT_ID is unset or still the .env.example placeholder. ' +
      'Google sign-in will answer 503 until it is set. Start with `npm run auth` ' +
      'so .env is loaded.\n',
  )
}

const app = await buildApp({ config })
await app.listen({ port: config.port, host: '0.0.0.0' })

process.stderr.write(`Aizzen auth service listening on ${config.serviceOrigin}\n`)
process.stderr.write(`User directory: ${config.userDirectoryPath}\n`)
