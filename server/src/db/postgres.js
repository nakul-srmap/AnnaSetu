import pg from 'pg'
import { COLLECTIONS, SPEC, columnName, createTableSql, fromRow, keyOf, toRow } from './spec.js'

// The whole register set is small — a district's worth of shops, cards and a
// day of bookings — so it is held in memory and written through to Postgres.
// That keeps every route and every domain rule synchronous, which is what the
// rest of this codebase is built on, while Postgres remains the record of
// truth across restarts.
//
// The trade-off is that this assumes a single API process. Running two would
// need the reads to go to the database instead; the accessors in db.js are the
// seam where that change would happen.

let pool = null

export function getPool(connectionString) {
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      // Fail fast with a clear message rather than hanging on a wrong host.
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 8000),
      ...(process.env.PGSSLMODE === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
    })
  }
  return pool
}

export async function ensureSchema() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const name of COLLECTIONS) await client.query(createTableSql(name))
    // Indexes on the columns the portals actually filter by. Everything else
    // is a full scan of a few hundred rows, which needs no help.
    await client.query(`
      CREATE INDEX IF NOT EXISTS bookings_shop_date_idx ON "bookings" ("shop", "date");
      CREATE INDEX IF NOT EXISTS bookings_card_idx ON "bookings" ("card_number");
      CREATE INDEX IF NOT EXISTS transactions_shop_cycle_idx ON "transactions" ("shop", "cycle");
      CREATE INDEX IF NOT EXISTS transactions_card_cycle_idx ON "transactions" ("card_number", "cycle");
      CREATE INDEX IF NOT EXISTS cards_shop_idx ON "cards" ("shop");
      CREATE INDEX IF NOT EXISTS indents_shop_status_idx ON "indents" ("shop", "status");
      CREATE INDEX IF NOT EXISTS users_identifier_idx ON "users" ("identifier");
      CREATE INDEX IF NOT EXISTS otps_identifier_idx ON "otps" ("identifier");
    `)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function loadAll() {
  const state = {}
  for (const name of COLLECTIONS) {
    const { rows } = await pool.query(`SELECT * FROM "${SPEC[name].table}"`)
    state[name] = rows.map((r) => fromRow(name, r))
  }
  return state
}

// A fingerprint of what is currently stored, so a write only sends the rows
// that actually changed rather than rewriting a whole table.
export function snapshot(state) {
  const snap = {}
  for (const name of COLLECTIONS) {
    const map = new Map()
    for (const record of state[name] ?? []) map.set(keyOf(SPEC[name], record), JSON.stringify(record))
    snap[name] = map
  }
  return snap
}

function diff(previous, next) {
  const changes = {}
  for (const name of COLLECTIONS) {
    const before = previous[name] ?? new Map()
    const after = next[name] ?? new Map()
    const upserts = []
    const deletes = []
    for (const [key, json] of after) if (before.get(key) !== json) upserts.push(JSON.parse(json))
    for (const key of before.keys()) if (!after.has(key)) deletes.push(key)
    if (upserts.length || deletes.length) changes[name] = { upserts, deletes }
  }
  return changes
}

export async function persistChanges(previous, next) {
  const changes = diff(previous, next)
  if (Object.keys(changes).length === 0) return { written: 0, removed: 0 }

  const client = await pool.connect()
  let written = 0
  let removed = 0
  try {
    await client.query('BEGIN')
    for (const [name, { upserts, deletes }] of Object.entries(changes)) {
      const spec = SPEC[name]
      const fields = Object.keys(spec.columns)
      const cols = ['row_key', ...fields.map(columnName), 'attrs']
      const quoted = cols.map((c) => `"${c}"`).join(', ')
      const assignments = cols
        .filter((c) => c !== 'row_key')
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(', ')

      for (const record of upserts) {
        const { row_key, values, attrs } = toRow(name, record)
        const params = [row_key, ...values, JSON.stringify(attrs)]
        const placeholders = params.map((_, i) => `$${i + 1}`).join(', ')
        await client.query(
          `INSERT INTO "${spec.table}" (${quoted}) VALUES (${placeholders})
           ON CONFLICT ("row_key") DO UPDATE SET ${assignments}`,
          params,
        )
        written += 1
      }

      if (deletes.length) {
        await client.query(`DELETE FROM "${spec.table}" WHERE "row_key" = ANY($1::text[])`, [deletes])
        removed += deletes.length
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return { written, removed }
}

export async function truncateAll() {
  const tables = COLLECTIONS.map((n) => `"${SPEC[n].table}"`).join(', ')
  await pool.query(`TRUNCATE ${tables}`)
}

export async function closePool() {
  if (pool) await pool.end()
  pool = null
}
