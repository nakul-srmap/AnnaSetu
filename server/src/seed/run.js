import fs from 'node:fs'
import path from 'node:path'
import { db, flush, initDb, usingPostgres } from '../db.js'
import { config } from '../config.js'
import { buildSeed, cardPin, credentialFor, SEED_ACCOUNTS } from './data.js'

// `npm run seed` — initialises or resets the registers. Destructive by design.
try {
  await initDb()
} catch (err) {
  console.error(`Could not open the database: ${err.message}`)
  process.exit(1)
}

// On Postgres the old rows are cleared first, so a reseed leaves nothing from
// a previous run behind.
if (usingPostgres()) {
  const { truncateAll } = await import('../db/postgres.js')
  await truncateAll()
  db.replace({})
  await flush()
}

const state = buildSeed()
db.replace(state)

// The seed must actually be on disk before this process exits.
try {
  await flush()
} catch (err) {
  console.error(`Seed failed to write: ${err.message}`)
  process.exit(1)
}

console.log(`Seeded ${usingPostgres() ? 'PostgreSQL' : config.dbPath}`)
console.log(
  `  ${state.shops.length} shops across ${new Set(state.shops.map((s) => s.district)).size} districts, ` +
    `${state.cards.length} cards, ${state.users.length} accounts`,
)
console.log('\nAccounts:')
for (const a of SEED_ACCOUNTS) {
  console.log(`  ${a.role.padEnd(12)} ${a.identifier.padEnd(14)} ${a.note.padEnd(14)} ${a.name}`)
}

// Every shop has a dealer and every district an officer, which is far too many
// lines to print. The full list is written beside the database instead.
const rows = [
  ['role', 'sign-in', 'password', 'shop / district', 'name'],
  ...state.users
    .filter((u) => u.role !== 'beneficiary')
    .map((u) => [u.role, u.identifier, credentialFor(u), u.shopCode ?? u.district ?? '—', u.name]),
  ...state.cards.map((c) => ['beneficiary', c.number, cardPin(c.number), c.district, c.holder]),
]
const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n')
const listPath = path.join(path.dirname(config.dbPath), 'accounts.csv')
fs.mkdirSync(path.dirname(listPath), { recursive: true })
fs.writeFileSync(listPath, csv)

console.log(
  `\n  ${state.users.filter((u) => u.role === 'dealer').length} dealers, ` +
    `${state.users.filter((u) => u.role === 'officer').length} officers and ` +
    `${state.cards.length} households across ` +
    `${new Set(state.shops.map((s) => s.district)).size} districts.`,
)
console.log(`  Every credential: ${listPath}`)

if (usingPostgres()) {
  const { closePool } = await import('../db/postgres.js')
  await closePool()
}
