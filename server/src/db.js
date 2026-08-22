import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// The register set, held in memory and written through to whichever backend is
// configured. Every route goes through db.<collection>() rather than touching
// storage, so swapping the backend is this file and nothing else.
//
// Set DATABASE_URL and this runs on Postgres. Leave it unset and it falls back
// to a JSON file, which is what the test suite uses so tests need no server.

let state = null
let backend = 'file'
let pgApi = null
let lastSnapshot = null

// Writes are queued so two requests landing together cannot interleave their
// transactions, and so a route can return without waiting on the database.
let flushChain = Promise.resolve()
let pendingError = null

export const emptyState = () => ({
  users: [],
  cards: [],
  shops: [],
  bookings: [],
  transactions: [],
  grievances: [],
  deliveries: [],
  indents: [],
  consignments: [],
  scanExceptions: [],
  otps: [],
})

export const usingPostgres = () => backend === 'postgres'

const countsOf = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length]))

// Called once at startup, before the server accepts requests.
export async function initDb({ url = config.databaseUrl } = {}) {
  if (url) {
    pgApi = await import('./db/postgres.js')
    pgApi.getPool(url)
    await pgApi.ensureSchema()
    const loaded = await pgApi.loadAll()
    state = { ...emptyState(), ...loaded }
    lastSnapshot = pgApi.snapshot(state)
    backend = 'postgres'
    return { backend, counts: countsOf(state) }
  }

  backend = 'file'
  loadFile()
  return { backend, counts: countsOf(state) }
}

function loadFile() {
  if (state) return state
  try {
    state = { ...emptyState(), ...JSON.parse(fs.readFileSync(config.dbPath, 'utf8')) }
  } catch {
    state = emptyState()
  }
  return state
}

const load = () => state ?? loadFile()

function persistFile() {
  if (process.env.DB_NO_PERSIST === '1') return
  try {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
    fs.writeFileSync(config.dbPath, JSON.stringify(state, null, 2))
  } catch (err) {
    console.warn('[db] could not persist:', err.message)
  }
}

function persist() {
  if (backend !== 'postgres') return persistFile()

  // Take the fingerprint synchronously, so the queued write records the state
  // as it was at this moment even if another request mutates it next.
  const before = lastSnapshot
  const after = pgApi.snapshot(state)
  lastSnapshot = after

  flushChain = flushChain
    .then(() => pgApi.persistChanges(before, after))
    .catch((err) => {
      pendingError = err
      console.error('[db] write to Postgres failed:', err.message)
    })
}

// Await this where a caller must know the write reached the database — the
// seed does, a request handler does not.
export async function flush() {
  await flushChain
  if (pendingError) {
    const err = pendingError
    pendingError = null
    throw err
  }
}

export const db = {
  raw: () => load(),
  users: () => load().users,
  cards: () => load().cards,
  shops: () => load().shops,
  bookings: () => load().bookings,
  transactions: () => load().transactions,
  grievances: () => load().grievances,
  deliveries: () => load().deliveries,
  indents: () => load().indents,
  consignments: () => load().consignments,
  scanExceptions: () => load().scanExceptions,
  otps: () => load().otps,

  // All writes funnel through here, so persistence can never be forgotten.
  write(mutator) {
    const current = load()
    const result = mutator(current)
    persist()
    return result
  },

  replace(next) {
    state = { ...emptyState(), ...next }
    persist()
    return state
  },

  card: (number) => load().cards.find((c) => c.number === number) ?? null,
  shop: (code) => load().shops.find((s) => s.code === code) ?? null,
}
