import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

/*
 * Entry point. Run with:  npm run auth
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment.
 * Neither value is ever committed — see .env.example.
 */
const config = loadConfig()

const app = await buildApp({ config })
await app.listen({ port: config.port, host: '0.0.0.0' })

process.stderr.write(`Aizzen auth service listening on ${config.serviceOrigin}\n`)
