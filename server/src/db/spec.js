// One description of every register, used to build the schema, to read rows
// back, and to work out what changed on a write. Keeping it in one place means
// adding a field is a single edit rather than four.
//
// Columns listed here become real, queryable columns. Anything else on a
// record is kept in an `attrs` JSONB column, so a nested object like a shop's
// stock does not need a table of its own for a system this size.
//
// Dates and timestamps are stored as TEXT holding ISO 8601. That is deliberate:
// the application compares them as strings throughout, ISO 8601 sorts
// correctly as text, and it round-trips through the driver without timezone
// surprises. Numbers, booleans and nested objects use real types.

const T = 'text'
const N = 'numeric'
const I = 'integer'
const B = 'boolean'

export const SPEC = {
  users: {
    table: 'users',
    key: 'id',
    columns: {
      id: T, identifier: T, passwordHash: T, role: T, name: T,
      cardNumber: T, shopCode: T, district: T, createdAt: T,
    },
  },
  cards: {
    table: 'cards',
    key: 'number',
    columns: {
      number: T, holder: T, scheme: T, members: I, mobile: T,
      address: T, shop: T, district: T, mandal: T,
    },
  },
  shops: {
    table: 'shops',
    key: 'code',
    columns: {
      code: T, name: T, dealer: T, licence: T, address: T,
      district: T, mandal: T, lat: N, lng: N,
      timings: T, weeklyClosing: T, device: T,
    },
  },
  bookings: {
    table: 'bookings',
    key: 'id',
    columns: {
      id: T, token: T, secret: T, cardNumber: T, shop: T,
      slot: T, date: T, status: T, channel: T, bookedBy: T, createdAt: T,
    },
  },
  transactions: {
    table: 'transactions',
    key: 'id',
    columns: {
      id: T, token: T, cardNumber: T, shop: T, dealerId: T,
      payable: N, cycle: T, date: T, issuedAt: T, device: T,
    },
  },
  grievances: {
    table: 'grievances',
    key: 'id',
    columns: {
      id: T, cardNumber: T, holder: T, category: T, shop: T,
      details: T, transactionId: T, stage: T, open: B, filedAt: T,
    },
  },
  deliveries: {
    table: 'deliveries',
    key: 'id',
    columns: {
      id: T, cardNumber: T, holder: T, shop: T, address: T,
      window: T, status: T, requestedAt: T,
    },
  },
  indents: {
    table: 'indents',
    key: 'id',
    columns: {
      id: T, shop: T, commodity: T, quantity: N, status: T, raisedAt: T,
    },
  },
  consignments: {
    table: 'consignments',
    key: 'tag',
    columns: {
      tag: T, indentId: T, shop: T, commodity: T, weightKg: N,
      status: T, dispatchedAt: T, receivedAt: T,
    },
  },
  scanExceptions: {
    table: 'scan_exceptions',
    // No natural key on the record, so one is derived. A manual entry is
    // identified by the shop, the token and the moment it happened.
    key: (r) => `${r.shop}|${r.token}|${r.at}`,
    columns: { shop: T, token: T, at: T },
  },
  otps: {
    table: 'otps',
    key: (r) => `${r.identifier}|${r.issuedAt}`,
    columns: {
      identifier: T, hash: T, issuedAt: N, expiresAt: N,
      attempts: I, consumed: B,
    },
  },
}

export const COLLECTIONS = Object.keys(SPEC)

// camelCase in the application, snake_case in the database.
export const columnName = (field) => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

export const keyOf = (spec, row) =>
  typeof spec.key === 'function' ? spec.key(row) : String(row[spec.key])

export function createTableSql(name) {
  const spec = SPEC[name]
  const cols = Object.entries(spec.columns).map(
    ([field, type]) => `  "${columnName(field)}" ${type}`,
  )
  return [
    `CREATE TABLE IF NOT EXISTS "${spec.table}" (`,
    ['  "row_key" text PRIMARY KEY', ...cols, '  "attrs" jsonb NOT NULL DEFAULT \'{}\'::jsonb'].join(',\n'),
    ');',
  ].join('\n')
}

// A record as it goes into the table: known fields to columns, the rest to attrs.
export function toRow(name, record) {
  const spec = SPEC[name]
  const fields = Object.keys(spec.columns)
  const attrs = {}
  for (const [k, v] of Object.entries(record)) {
    if (!fields.includes(k)) attrs[k] = v
  }
  return {
    row_key: keyOf(spec, record),
    values: fields.map((f) => record[f] ?? null),
    attrs,
  }
}

// A row as it comes back out. Column values win over attrs, so a field that
// was promoted to a column in a later version still reads correctly.
export function fromRow(name, row) {
  const spec = SPEC[name]
  const record = { ...(row.attrs ?? {}) }
  for (const field of Object.keys(spec.columns)) {
    const value = row[columnName(field)]
    if (value !== null && value !== undefined) record[field] = coerce(spec.columns[field], value)
    else if (!(field in record)) record[field] = null
  }
  return record
}

// numeric comes back from the driver as a string; the application expects a
// number, and an equality check on a string would report a false change.
const coerce = (type, value) => (type === N || type === I ? Number(value) : value)
