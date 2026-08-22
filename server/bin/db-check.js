// `npm run db:check` — answers "is my database actually connected?" without
// starting the server, because that is the question when something is wrong.
import { config } from '../src/config.js'
import { db, initDb, usingPostgres } from '../src/db.js'

if (!config.databaseUrl) {
  console.log('DATABASE_URL is not set.')
  console.log(`Running on the JSON file: ${config.dbPath}`)
  console.log('\nTo use PostgreSQL, set DATABASE_URL in server/.env and run this again.')
  process.exit(0)
}

// Never print the password.
const safeUrl = config.databaseUrl.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@')
console.log(`Connecting to ${safeUrl}`)

try {
  const { counts } = await initDb()
  console.log(`\nConnected. Backend: ${usingPostgres() ? 'PostgreSQL' : 'JSON file'}\n`)
  for (const [name, n] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(16)} ${String(n).padStart(5)} rows`)
  }
  if (db.users().length === 0) {
    console.log('\nThe tables are empty. Run `npm run seed` to load the registers.')
  }
  const { closePool } = await import('../src/db/postgres.js')
  await closePool()
} catch (err) {
  console.error(`\nCould not connect: ${err.message}\n`)
  const hints = {
    ECONNREFUSED: 'Nothing is listening on that host and port. Is PostgreSQL running?',
    ENOTFOUND: 'That hostname does not resolve. Check the host in DATABASE_URL.',
    ETIMEDOUT: 'The connection timed out. A firewall or wrong host is the usual cause.',
    '28P01': 'The password is wrong for that user.',
    '3D000': 'That database does not exist yet. Create it, then run `npm run seed`.',
    '28000': 'That user does not exist, or is not allowed to connect.',
  }
  const hint = hints[err.code]
  if (hint) console.error(`  ${hint}\n`)
  process.exit(1)
}
