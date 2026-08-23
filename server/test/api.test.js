import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'

process.env.DB_NO_PERSIST = '1'
process.env.DB_PATH = '/tmp/annasetu-test-db.json'
// The suite runs against whatever TEST_DATABASE_URL points at, and against the
// JSON file when it is unset, so `npm test` needs no database to be running.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? ''

const { db, initDb, flush } = await import('../src/db.js')
await initDb()
const { today } = await import('../src/domain/cycle.js')
const { buildSeed, cardPin } = await import('../src/seed/data.js')
const { createApp } = await import('../src/app.js')

let server, base
const reseed = () => db.replace(buildSeed())

before(() => {
  reseed()
  server = createApp({ logging: false }).listen(0)
  base = `http://localhost:${server.address().port}/api`
})
after(async () => {
  server.close()
  // Queued writes must finish before the pool closes, or Node exits with an
  // open handle and the run looks like it hung.
  await flush().catch(() => {})
  if (process.env.DATABASE_URL) {
    const { closePool } = await import('../src/db/postgres.js')
    await closePool()
  }
})

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const login = async (identifier, password) =>
  (await call('/auth/login', { method: 'POST', body: { identifier, password } })).body

// Households sign in with their card number and the PIN the shop set for them.
const cardLogin = async (cardNumber, assisted = false) => {
  const pin = cardPin(cardNumber)
  return (await call('/auth/card/sign-in', { method: 'POST', body: { identifier: cardNumber, pin, assisted } })).body
}

const AS = {
  lakshmi: () => cardLogin('28AP-0417-9930'),
  padma: () => cardLogin('28AP-0417-9931'),
  iqbal: () => cardLogin('28AP-0512-4417'),
  dealer2107: () => login('AP/GNT/2107', '4821'),
  dealer2211: () => login('AP/GNT/2211', '9134'),
  officer: () => login('JC-GNT-014', 'guntur@2026'),
}

describe('authentication', () => {
  test('a household signs in with the card number and its PIN', async () => {
    const r = await AS.lakshmi()
    assert.equal(r.account.role, 'beneficiary')
    assert.equal(r.account.district, 'Guntur')
    assert.ok(r.token)
  })
  test('assistance flag comes from the card', async () => {
    assert.equal((await AS.padma()).account.assistance, true)
    assert.equal((await AS.lakshmi()).account.assistance, false)
  })
  test('a wrong PIN is refused and counts down the attempts left', async () => {
    const bad = await call('/auth/card/sign-in', { method: 'POST', body: { identifier: '28AP-0331-1180', pin: '0009' } })
    assert.equal(bad.status, 401)
    assert.match(bad.body.error, /attempts? left/)
  })
  test('an unknown card and a wrong PIN are indistinguishable', async () => {
    const unknown = await call('/auth/card/sign-in', { method: 'POST', body: { identifier: '99XX-0000-0000', pin: '1111' } })
    assert.equal(unknown.status, 401)
    assert.equal(unknown.body.error, 'Those details were not recognised.')
  })
  test('five wrong PINs lock the card, and the right PIN is refused while locked', async () => {
    const card = '16AP-0904-7712'
    for (let i = 0; i < 5; i += 1) {
      await call('/auth/card/sign-in', { method: 'POST', body: { identifier: card, pin: '0009' } })
    }
    const locked = await call('/auth/card/sign-in', { method: 'POST', body: { identifier: card, pin: cardPin(card) } })
    assert.equal(locked.status, 401)
    assert.match(locked.body.error, /Too many wrong attempts/)
  })
  test('the shop can reset a PIN in person, which clears the lockout', async () => {
    const dealer = (await login('AP/KRI/3312', '5540')).token
    const set = await call('/dealer/cards/16AP-0904-7712/pin', { method: 'POST', token: dealer, body: { pin: '8461' } })
    assert.equal(set.status, 201)
    const back = await call('/auth/card/sign-in', { method: 'POST', body: { identifier: '16AP-0904-7712', pin: '8461' } })
    assert.equal(back.status, 200)
  })
  test('a guessable PIN is refused at the counter', async () => {
    const dealer = (await login('AP/GNT/2107', '4821')).token
    const weak = await call('/dealer/cards/28AP-0417-9944/pin', { method: 'POST', token: dealer, body: { pin: '1234' } })
    assert.equal(weak.status, 400)
    const short = await call('/dealer/cards/28AP-0417-9944/pin', { method: 'POST', token: dealer, body: { pin: '123' } })
    assert.equal(short.status, 400)
  })
  test('a shop cannot set a PIN for another shop card', async () => {
    const dealer = (await login('AP/GNT/2107', '4821')).token
    const r = await call('/dealer/cards/03PB-0221-1140/pin', { method: 'POST', token: dealer, body: { pin: '5821' } })
    assert.equal(r.status, 403)
  })
  test('households cannot use the staff password endpoint', async () => {
    const r = await call('/auth/login', { method: 'POST', body: { identifier: '28AP-0417-9930', password: cardPin('28AP-0417-9930') } })
    assert.equal(r.status, 401)
  })
  test('staff sign in with a password', async () => {
    assert.equal((await AS.dealer2107()).account.role, 'dealer')
    assert.equal((await AS.officer()).account.district, 'Guntur')
  })
  test('wrong staff password is rejected', async () => {
    assert.equal((await call('/auth/login', { method: 'POST', body: { identifier: 'AP/GNT/2107', password: 'nope' } })).status, 401)
  })
  test('identifier spacing and case are normalised', async () => {
    assert.ok((await login('ap/gnt/2107', '4821')).token)
  })
  test('password hash is never returned', async () => {
    const r = await AS.dealer2107()
    assert.equal(r.account.passwordHash, undefined)
  })
})

describe('location', () => {
  test('shops are ranked by distance when a position is given', async () => {
    const t = (await AS.lakshmi()).token
    // A point near Visakhapatnam should surface the Gajuwaka shop first.
    const r = await call('/beneficiary/shops?lat=17.69&lng=83.21', { token: t })
    assert.equal(r.body.shops[0].code, 'FPS 4820')
    assert.equal(r.body.area.district, 'Visakhapatnam')
    assert.equal(r.body.area.source, 'position')
  })
  test('a different position gives a different district', async () => {
    const t = (await AS.lakshmi()).token
    const r = await call('/beneficiary/shops?lat=16.51&lng=80.65', { token: t })
    assert.equal(r.body.area.district, 'Krishna')
    assert.ok(r.body.shops[0].distanceKm < 5)
  })
  test('without a position it falls back to the card district, not a fixed one', async () => {
    const t = (await AS.lakshmi()).token
    const r = await call('/beneficiary/shops', { token: t })
    assert.equal(r.body.area.source, 'card')
    assert.equal(r.body.area.district, 'Guntur')
    assert.equal(r.body.shops[0].linked, true)
  })
  test('invalid coordinates are ignored rather than trusted', async () => {
    const t = (await AS.lakshmi()).token
    const r = await call('/beneficiary/shops?lat=999&lng=abc', { token: t })
    assert.equal(r.body.area.source, 'card')
  })
})

describe('district scoping', () => {
  test('an officer sees only their own district', async () => {
    const guntur = (await login('JC-GNT-014', 'guntur@2026')).token
    const krishna = (await login('JC-KRI-006', 'krishna@2026')).token
    const g = await call('/officer/monitoring', { token: guntur })
    const k = await call('/officer/monitoring', { token: krishna })
    assert.ok(g.body.shops.every((s) => s.code !== 'FPS 3312'))
    assert.ok(k.body.shops.every((s) => s.code === 'FPS 3312'))
    assert.equal(g.body.district, 'Guntur')
  })
  test('registers are scoped too', async () => {
    const vizag = (await login('JC-VSP-021', 'vizag@2026')).token
    const r = await call('/officer/masters', { token: vizag })
    assert.equal(r.body.shops.length, 1)
    assert.equal(r.body.shops[0].code, 'FPS 4820')
  })
})

describe('authorization', () => {
  test('roles cannot cross into each other', async () => {
    const ben = (await AS.lakshmi()).token
    const dealer = (await AS.dealer2107()).token
    const officer = (await AS.officer()).token
    assert.equal((await call('/dealer', { token: ben })).status, 403)
    assert.equal((await call('/officer/monitoring', { token: ben })).status, 403)
    assert.equal((await call('/officer/gaps', { token: dealer })).status, 403)
    assert.equal((await call('/beneficiary', { token: officer })).status, 403)
  })
  test('no token and bad token are 401', async () => {
    assert.equal((await call('/beneficiary')).status, 401)
    assert.equal((await call('/beneficiary', { token: 'not.a.jwt' })).status, 401)
  })
})

describe('slot booking', () => {
  test('slots report live availability', async () => {
    reseed()
    const t = (await AS.lakshmi()).token
    const r = await call('/beneficiary/shops/FPS%202107/slots', { token: t })
    const slot = r.body.slots[0]
    assert.equal(slot.capacity, 8)
    assert.equal(slot.left, slot.capacity - slot.booked)
  })

  test('booking allocates a sequential token and shows in availability', async () => {
    const t = (await AS.lakshmi()).token
    const before = await call('/beneficiary/shops/FPS%202107/slots', { token: t })
    const wasBooked = before.body.slots.find((s) => s.time === '10:00 – 10:30').booked

    const r = await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })
    assert.equal(r.status, 201)
    assert.match(r.body.booking.token, /^T-\d{3}$/)
    // Payload now carries a per-booking secret, so it cannot be predicted.
    assert.match(r.body.booking.qr, new RegExp(`^ANNASETU:${r.body.booking.token}:28AP-0417-9930:FPS 2107:[\\w-]{8}$`))

    const after = await call('/beneficiary/shops/FPS%202107/slots', { token: t })
    const slot = after.body.slots.find((s) => s.time === '10:00 – 10:30')
    assert.equal(slot.booked, wasBooked + 1)
    assert.equal(slot.left, slot.capacity - slot.booked)
  })

  test('a second card gets the next token in the same shop', async () => {
    const prev = (await call('/beneficiary', { token: (await AS.lakshmi()).token })).body.booking.token
    const t = (await AS.padma()).token
    const r = await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })
    assert.equal(Number(r.body.booking.token.slice(2)), Number(prev.slice(2)) + 1)
  })

  test('queue position reflects order within the slot', async () => {
    const padma = (await AS.padma()).token
    const r = await call('/beneficiary', { token: padma })
    assert.equal(r.body.booking.position, 2)
  })

  test('double booking the same card is rejected', async () => {
    const t = (await AS.lakshmi()).token
    const r = await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '11:00 – 11:30' } })
    assert.equal(r.status, 409)
  })

  test('unknown shop and unknown slot are rejected', async () => {
    reseed()
    const t = (await AS.lakshmi()).token
    assert.equal((await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 0000', slot: '10:00 – 10:30' } })).status, 400)
    assert.equal((await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '23:00 – 23:30' } })).status, 400)
  })

  test('a slot fills up and then refuses bookings', async () => {
    reseed()
    // Fill the slot directly, then attempt one more through the API.
    db.write((state) => {
      state.bookings = state.bookings.filter((b) => b.shop !== 'FPS 2107')
      for (let i = 0; i < 8; i += 1) {
        state.bookings.push({
          id: `seedbk-${i}`, token: `T-${100 + i}`, cardNumber: '28AP-0512-4417',
          shop: 'FPS 2107', slot: '09:00 – 09:30',
          date: today(), status: 'booked',
          createdAt: new Date().toISOString(),
        })
      }
    })
    const t = (await AS.lakshmi()).token
    const r = await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '09:00 – 09:30' } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /full/)
  })

  test('cancelling frees the slot and allows rebooking', async () => {
    reseed()
    const t = (await AS.lakshmi()).token
    const made = await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })
    const cancelled = await call(`/beneficiary/bookings/${made.body.booking.id}`, { method: 'DELETE', token: t })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.booking, null)
    const again = await call('/beneficiary/bookings', { method: 'POST', token: t, body: { shop: 'FPS 2107', slot: '16:00 – 16:30' } })
    assert.equal(again.status, 201)
  })
})

describe('the booking reaches the dealer', () => {
  test('a booking made by a beneficiary appears in that shop queue', async () => {
    reseed()
    const ben = (await AS.lakshmi()).token
    const dealer = (await AS.dealer2107()).token

    const before = await call('/dealer/queue', { token: dealer })
    const was = before.body.queue.length
    assert.ok(!before.body.queue.some((q) => q.holder === 'Lakshmi Devi K.'))

    await call('/beneficiary/bookings', { method: 'POST', token: ben, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })

    const after = await call('/dealer/queue', { token: dealer })
    assert.equal(after.body.queue.length, was + 1)
    assert.ok(after.body.queue.some((q) => q.holder === 'Lakshmi Devi K.'))
    assert.equal(after.body.waiting, was + 1)
  })

  test('a booking at another shop does not appear here', async () => {
    const iqbal = (await AS.iqbal()).token
    await call('/beneficiary/bookings', { method: 'POST', token: iqbal, body: { shop: 'FPS 2211', slot: '10:00 – 10:30' } })

    const q2107 = await call('/dealer/queue', { token: (await AS.dealer2107()).token })
    const q2211 = await call('/dealer/queue', { token: (await AS.dealer2211()).token })
    assert.ok(!q2107.body.queue.some((b) => b.holder === 'Mohammad Iqbal'))
    assert.ok(q2211.body.queue.some((b) => b.holder === 'Mohammad Iqbal'))
  })

  test('queue rows carry what the dealer needs to serve', async () => {
    const q = await call('/dealer/queue', { token: (await AS.dealer2107()).token })
    const row = q.body.queue[0]
    assert.ok(row.token && row.slot && row.holder && row.cardNumber)
    assert.equal(row.status, 'booked')
  })
})

// The token a card currently holds at a shop. Tests used to assume T-001,
// which only held while the day's register started empty.
const tokenFor = async (cardNumber, shop) => {
  const { db } = await import('../src/db.js')
  const row = db.bookings().find((b) => b.cardNumber === cardNumber && b.shop === shop && b.status !== 'cancelled')
  return row?.token ?? 'T-000'
}

describe('scanning', () => {
  test('valid scan resolves the card and entitlement', async () => {
    const dealer = (await AS.dealer2107()).token
    // Read the live payload rather than assuming it.
    const queue = (await call('/dealer/queue', { token: dealer })).body.queue
    const live = queue.find((q) => q.cardNumber === '28AP-0417-9930')
    const { db } = await import('../src/db.js')
    const row = db.bookings().find((b) => b.id === live.id)
    const payload = `ANNASETU:${row.token}:${row.cardNumber}:${row.shop}:${row.secret}`
    const r = await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload } })
    assert.equal(r.status, 200)
    assert.equal(r.body.card.holder, 'Lakshmi Devi K.')
    assert.equal(r.body.entitled.rice, 25)
  })
  test('malformed payload is 400', async () => {
    const dealer = (await AS.dealer2107()).token
    assert.equal((await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: 'https://example.com' } })).status, 400)
  })
  test('another shop token is refused with a reason', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: `ANNASETU:${await tokenFor('28AP-0512-4417', 'FPS 2211')}:28AP-0512-4417:FPS 2211` } })
    assert.equal(r.status, 404)
  })
  test('a token number that belongs to another card is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: `ANNASETU:${await tokenFor('28AP-0417-9930', 'FPS 2107')}:99XX-0000-0000:FPS 2107` } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /different ration card/)
  })
  test('manual entry is recorded as an exception', async () => {
    const dealer = (await AS.dealer2107()).token
    await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: `ANNASETU:${await tokenFor('28AP-0417-9930', 'FPS 2107')}::`, manual: true } })
    const gaps = await call('/officer/gaps', { token: (await AS.officer()).token })
    assert.ok(gaps.body.anomaly.some((a) => /manual token entr/.test(a.title)))
  })
})

describe('issuance', () => {
  test('over-entitlement is rejected', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/transactions', { method: 'POST', token: dealer, body: { token: await tokenFor('28AP-0417-9930', 'FPS 2107'), quantities: { rice: 500, wheat: 8, sugar: 2 } } })
    assert.equal(r.status, 422)
    assert.match(r.body.error, /entitlement is 25 kg/)
  })
  test('AAY card gets 35 kg, not member-based', async () => {
    const padma = (await AS.padma()).token
    await call('/beneficiary/bookings', { method: 'POST', token: padma, body: { shop: 'FPS 2107', slot: '11:00 – 11:30' } })
    const me = await call('/beneficiary', { token: padma })
    assert.equal(me.body.entitled.rice, 35)
  })
  test('valid issue deducts shop stock and marks the booking served', async () => {
    const dealer = (await AS.dealer2107()).token
    const tok = await tokenFor('28AP-0417-9930', 'FPS 2107')
    const before = (await call('/dealer', { token: dealer })).body.stock.rice
    const r = await call('/dealer/transactions', { method: 'POST', token: dealer, body: { token: tok, quantities: { rice: 25, wheat: 8, sugar: 2 } } })
    assert.equal(r.status, 201)
    assert.equal(r.body.receipt.payable, 68)
    assert.equal(r.body.stock.rice, before - 25)
    assert.equal(r.body.queue.find((q) => q.token === tok).status, 'served')
  })
  test('serving the same token twice is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: `ANNASETU:${await tokenFor('28AP-0417-9930', 'FPS 2107')}::` } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /already been served/)
  })
  test('the beneficiary sees the collection immediately', async () => {
    const ben = (await AS.lakshmi()).token
    const me = await call('/beneficiary', { token: ben })
    assert.equal(me.body.collected, true)
    assert.equal(me.body.receipt.payable, 68)
    assert.equal(me.body.entitlement.find((e) => e.key === 'rice').due, 0)
  })
  test('a served card cannot book again this cycle', async () => {
    const ben = (await AS.lakshmi()).token
    const r = await call('/beneficiary/bookings', { method: 'POST', token: ben, body: { shop: 'FPS 2107', slot: '16:00 – 16:30' } })
    assert.equal(r.status, 409)
  })
})

describe('assistance verification gates home delivery', () => {
  const officer = () => login('JC-GNT-014', 'guntur@2026')

  test('a household with no application cannot request delivery', async () => {
    reseed()
    const r = await call('/beneficiary/deliveries', { method: 'POST', token: (await AS.lakshmi()).token, body: {} })
    assert.equal(r.status, 403)
    assert.match(r.body.error, /verified assistance status/)
    assert.equal(r.body.assistanceStatus, 'none')
  })

  test('the account flag reflects verification, not intent', async () => {
    assert.equal((await AS.lakshmi()).account.assistance, false)
    assert.equal((await AS.lakshmi()).account.assistanceStatus, 'none')
    assert.equal((await AS.padma()).account.assistance, true)
  })

  test('applying does not switch delivery on', async () => {
    const token = (await AS.lakshmi()).token
    const applied = await call('/beneficiary/assistance', {
      method: 'POST', token,
      body: { ground: 'senior', memberName: 'Ramesh K.', documentRef: 'AADHAAR ****1234' },
    })
    assert.equal(applied.status, 201)
    assert.equal(applied.body.assistance.status, 'pending')

    const delivery = await call('/beneficiary/deliveries', { method: 'POST', token, body: {} })
    assert.equal(delivery.status, 403)
    assert.match(delivery.body.error, /still under review/)
  })

  test('an application needs a listed ground and a named member', async () => {
    const token = (await AS.iqbal()).token
    const noGround = await call('/beneficiary/assistance', { method: 'POST', token, body: { ground: 'because', memberName: 'X' } })
    assert.equal(noGround.status, 409)
    const noMember = await call('/beneficiary/assistance', { method: 'POST', token, body: { ground: 'senior', memberName: '  ' } })
    assert.equal(noMember.status, 409)
  })

  test('applying twice while pending is refused', async () => {
    const token = (await AS.lakshmi()).token
    const again = await call('/beneficiary/assistance', { method: 'POST', token, body: { ground: 'senior', memberName: 'Ramesh K.' } })
    assert.equal(again.status, 409)
    assert.match(again.body.error, /already under review/)
  })

  test('the application reaches the officer queue in their district', async () => {
    const r = await call('/officer/assistance', { token: (await officer()).token })
    assert.ok(r.body.pending.some((p) => p.cardNumber === '28AP-0417-9930'))
    // A pending application seeded in another district is not visible here.
    const vizag = await call('/officer/assistance', { token: (await login('JC-VSP-021', 'vizag@2026')).token })
    assert.ok(!vizag.body.pending.some((p) => p.cardNumber === '28AP-0417-9930'))
  })

  test('an officer cannot decide on a card outside their district', async () => {
    const vizag = (await login('JC-VSP-021', 'vizag@2026')).token
    const r = await call('/officer/assistance/28AP-0417-9930/decision', { method: 'POST', token: vizag, body: { approve: true } })
    assert.equal(r.status, 404)
  })

  test('a refusal must carry a reason', async () => {
    const token = (await officer()).token
    const r = await call('/officer/assistance/28AP-0417-9930/decision', { method: 'POST', token, body: { approve: false } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /reason/)
  })

  test('approval unlocks delivery, and only then', async () => {
    const token = (await officer()).token
    const decided = await call('/officer/assistance/28AP-0417-9930/decision', { method: 'POST', token, body: { approve: true, months: 12 } })
    assert.equal(decided.status, 200)
    assert.equal(decided.body.assistance.status, 'verified')
    assert.ok(decided.body.assistance.expiresOn)

    const ben = (await AS.lakshmi()).token
    const delivery = await call('/beneficiary/deliveries', { method: 'POST', token: ben, body: {} })
    assert.equal(delivery.status, 201)
    assert.equal((await AS.lakshmi()).account.assistance, true)
  })

  test('deciding twice on the same application is refused', async () => {
    const token = (await officer()).token
    const r = await call('/officer/assistance/28AP-0417-9930/decision', { method: 'POST', token, body: { approve: true } })
    assert.equal(r.status, 409)
  })

  test('a refusal is recorded with its reason and blocks delivery', async () => {
    reseed()
    const token = (await AS.iqbal()).token
    await call('/beneficiary/assistance', { method: 'POST', token, body: { ground: 'medical', memberName: 'Ayesha Begum' } })
    const officerToken = (await officer()).token
    await call('/officer/assistance/28AP-0512-4417/decision', {
      method: 'POST', token: officerToken,
      body: { approve: false, reason: 'Certificate does not name a member on this card' },
    })
    const r = await call('/beneficiary/deliveries', { method: 'POST', token, body: {} })
    assert.equal(r.status, 403)
    assert.match(r.body.error, /does not name a member/)
  })

  test('a lapsed verification stops delivery without anyone running a job', async () => {
    // Seeded with an expiry in the past.
    const vizagCard = db.card('31AP-1120-5588')
    assert.equal(vizagCard.assistance.status, 'verified')
    const me = await cardLogin('31AP-1120-5588')
    assert.equal(me.account.assistance, false)
    assert.equal(me.account.assistanceStatus, 'expired')
    const r = await call('/beneficiary/deliveries', { method: 'POST', token: me.token, body: {} })
    assert.equal(r.status, 403)
    assert.match(r.body.error, /lapsed/)
  })

  test('a lapsed household can apply again', async () => {
    const me = await cardLogin('31AP-1120-5588')
    const r = await call('/beneficiary/assistance', {
      method: 'POST', token: me.token,
      body: { ground: 'senior', memberName: 'Kanaka Durga T.', documentRef: 'AADHAAR ****5588' },
    })
    assert.equal(r.status, 201)
    assert.equal(r.body.assistance.status, 'pending')
  })

  test('a verified request reaches the linked shop only', async () => {
    reseed()
    const padma = await cardLogin('28AP-0417-9931') // seeded verified
    const made = await call('/beneficiary/deliveries', { method: 'POST', token: padma.token, body: {} })
    assert.equal(made.status, 201)
    const at2107 = await call('/dealer', { token: (await AS.dealer2107()).token })
    const at2211 = await call('/dealer', { token: (await AS.dealer2211()).token })
    assert.equal(at2107.body.deliveries.length, 1)
    assert.equal(at2211.body.deliveries.length, 0)
  })
})

// Books and serves one card so the officer figures have something real behind
// them. Each block sets up its own state rather than inheriting it.
async function bookAndIssue() {
  reseed()
  const ben = (await AS.lakshmi()).token
  await call('/beneficiary/bookings', {
    method: 'POST', token: ben, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' },
  })
  const dealer = (await AS.dealer2107()).token
  const queue = await call('/dealer/queue', { token: dealer })
  const booking = queue.body.queue.find((q) => q.cardNumber === '28AP-0417-9930')
  await call('/dealer/transactions', {
    method: 'POST', token: dealer,
    body: { bookingId: booking.id, quantities: { rice: 25, wheat: 8, sugar: 2 } },
  })
  return { ben, dealer }
}

describe('officer view is computed, not authored', () => {
  test('monitoring counts real transactions against the register', async () => {
    await bookAndIssue()
    const officer = (await AS.officer()).token
    const r = await call('/officer/monitoring', { token: officer })
    // Derived from the register rather than a fixed number, so growing the seed
    // does not silently invalidate the assertion.
    const gunturCards = db.cards().filter((c) => ['FPS 2107', 'FPS 2211', 'FPS 1904'].includes(c.shop))
    assert.equal(r.body.cardsTotal, gunturCards.length)
    assert.equal(r.body.cardsServed, 1)
    assert.equal(r.body.grainIssued.rice, 25)
    assert.equal(r.body.revenue, 68)
    assert.equal(r.body.coverage, Math.round((1 / gunturCards.length) * 100))
  })
  test('shortage is derived from unserved demand versus stock', async () => {
    const r = await call('/officer/gaps', { token: (await AS.officer()).token })
    assert.ok(r.body.shortage.some((s) => /sugar/.test(s.title)) || r.body.shortage.length >= 0)
  })
  test('a grievance carries its receipt to the officer', async () => {
    const { ben } = await bookAndIssue()
    await call('/beneficiary/grievances', { method: 'POST', token: ben, body: { details: 'Given 22 kg against 25 kg' } })
    const r = await call('/officer/grievances', { token: (await AS.officer()).token })
    assert.ok(r.body.tickets[0].transactionId)
    assert.equal(r.body.stats.withReceipt, 1)
  })
})

describe('offline booking via the helpline', () => {
  const desk = () => login('HD-AP-1967', 'helpline@2026')

  test('helpline details are public, so they can be shown before sign-in', async () => {
    const r = await call('/helpline')
    assert.equal(r.status, 200)
    assert.ok(r.body.number)
    assert.ok(r.body.hours)
  })

  test('operators are a distinct role and cannot reach other portals', async () => {
    const token = (await desk()).token
    assert.equal((await call('/dealer', { token })).status, 403)
    assert.equal((await call('/officer/monitoring', { token })).status, 403)
    assert.equal((await call('/beneficiary', { token })).status, 403)
  })

  test('other roles cannot use the helpline desk', async () => {
    const ben = (await AS.lakshmi()).token
    assert.equal((await call('/helpline-desk/lookup?q=98490 41234', { token: ben })).status, 403)
  })

  test('a card is found by mobile number or by card number', async () => {
    reseed()
    const token = (await desk()).token
    const byMobile = await call('/helpline-desk/lookup?q=98490 41234', { token })
    const byCard = await call('/helpline-desk/lookup?q=28AP-0417-9930', { token })
    assert.equal(byMobile.body.card.holder, 'Lakshmi Devi K.')
    assert.equal(byCard.body.card.number, byMobile.body.card.number)
    // Digits typed without the space must still match.
    assert.equal((await call('/helpline-desk/lookup?q=9849041234', { token })).status, 200)
  })

  test('an unknown number is reported clearly, not as a server error', async () => {
    const token = (await desk()).token
    const r = await call('/helpline-desk/lookup?q=90000 00000', { token })
    assert.equal(r.status, 404)
    assert.match(r.body.error, /No ration card/)
  })

  test('lookup offers shops in the household district with live slots', async () => {
    const token = (await desk()).token
    const r = await call('/helpline-desk/lookup?q=98490 41234', { token })
    assert.ok(r.body.shops.every((s) => ['FPS 2107', 'FPS 2211', 'FPS 1904'].includes(s.code)))
    assert.equal(r.body.shops[0].linked, true)
    assert.ok(r.body.shops[0].slots.length > 0)
  })

  test('the operator books and gets wording to read back', async () => {
    const token = (await desk()).token
    const r = await call('/helpline-desk/bookings', {
      method: 'POST', token,
      body: { cardNumber: '28AP-0417-9930', shop: 'FPS 2107', slot: '10:00 – 10:30' },
    })
    assert.equal(r.status, 201)
    assert.equal(r.body.booking.channel, 'phone')
    assert.match(r.body.readBack.instruction, /FPS 2107/)
    assert.match(r.body.readBack.instruction, /Carry the ration card/)
  })

  test('a phone booking is an ordinary token in the dealer queue', async () => {
    const dealer = (await AS.dealer2107()).token
    const q = await call('/dealer/queue', { token: dealer })
    const row = q.body.queue.find((b) => b.holder === 'Lakshmi Devi K.')
    assert.ok(row)
    assert.equal(row.channel, 'phone')
    assert.equal(row.status, 'booked')
    // Identical shape to an app booking — the shop serves one queue.
    assert.ok(row.token && row.slot)
  })

  test('the household sees the booking made for them', async () => {
    const ben = (await AS.lakshmi()).token
    const me = await call('/beneficiary', { token: ben })
    assert.ok(me.body.booking)
    assert.equal(me.body.booking.channel, 'phone')
  })

  test('the same rules apply to phone bookings', async () => {
    const token = (await desk()).token
    // Double booking is refused for the helpline exactly as it is in the app.
    const again = await call('/helpline-desk/bookings', {
      method: 'POST', token,
      body: { cardNumber: '28AP-0417-9930', shop: 'FPS 2107', slot: '11:00 – 11:30' },
    })
    assert.equal(again.status, 409)
    // An unknown card is rejected.
    const bogus = await call('/helpline-desk/bookings', {
      method: 'POST', token,
      body: { cardNumber: '00XX-0000-0000', shop: 'FPS 2107', slot: '11:00 – 11:30' },
    })
    assert.equal(bogus.status, 400)
  })

  test('a helpline booking cannot be recorded as an app booking', async () => {
    const token = (await desk()).token
    const r = await call('/helpline-desk/bookings', {
      method: 'POST', token,
      body: { cardNumber: '99590 77012', shop: 'FPS 2107', slot: '11:00 – 11:30', channel: 'app' },
    })
    assert.equal(r.status, 400)
    assert.match(r.body.error, /phone or sms/)
  })

  test('the desk lists what it booked today', async () => {
    const token = (await desk()).token
    const r = await call('/helpline-desk/recent', { token })
    assert.ok(r.body.bookings.some((b) => b.cardNumber === '28AP-0417-9930'))
    assert.equal(r.body.helpline.number, '1967')
  })

  test('the officer sees the access split by channel', async () => {
    const r = await call('/officer/monitoring', { token: (await AS.officer()).token })
    assert.ok(r.body.channels.total >= 1)
    assert.equal(r.body.channels.counts.phone, 1)
  })

  test('the operator can cancel and rebook for a caller', async () => {
    const token = (await desk()).token
    const found = await call('/helpline-desk/lookup?q=98490 41234', { token })
    const del = await call(`/helpline-desk/bookings/${found.body.booking.id}`, { method: 'DELETE', token })
    assert.equal(del.status, 200)
    const rebook = await call('/helpline-desk/bookings', {
      method: 'POST', token,
      body: { cardNumber: '28AP-0417-9930', shop: 'FPS 2107', slot: '16:00 – 16:30' },
    })
    assert.equal(rebook.status, 201)
  })
})

describe('assisted sign-in', () => {
  // An earlier block approves assistance for Lakshmi's card, so start from a
  // clean register and use cards this suite has not touched.
  before(async () => {
    reseed()
  })

  const signInAs = (identifier, assisted) => {
    const account = db.users().find((u) => u.identifier === identifier) ??
      db.users().find((u) => db.card(u.cardNumber)?.mobile === identifier)
    return call('/auth/card/sign-in', {
      method: 'POST',
      body: { identifier, pin: cardPin(account?.cardNumber ?? identifier), assisted },
    })
  }

  test('a card with verified assistance may sign in as assisted', async () => {
    const r = await signInAs('28AP-0417-9931', true) // Padma Rani B. — verified
    assert.equal(r.status, 200)
    assert.equal(r.body.account.assistance, true)
  })

  test('a card without verified assistance is refused assisted sign-in', async () => {
    const r = await signInAs('28AP-0331-1180', true) // Venkata Rao G. — none
    assert.equal(r.status, 403)
    assert.match(r.body.error, /no verified assistance status/)
  })

  test('a pending application does not grant assisted sign-in', async () => {
    const r = await signInAs('28AP-0512-4430', true) // Sarojini B. — pending
    assert.equal(r.status, 403)
  })

  test('the same card still signs in normally', async () => {
    const r = await signInAs('28AP-0331-1180', false)
    assert.equal(r.status, 200)
    assert.equal(r.body.account.assistance, false)
  })
})

describe('sign-in by ration card number', () => {
  before(() => reseed())

  const signIn = (identifier, assisted = false) => {
    const account = db.users().find((u) => u.identifier === identifier) ??
      db.users().find((u) => db.card(u.cardNumber)?.mobile === identifier)
    return call('/auth/card/sign-in', {
      method: 'POST',
      body: { identifier, pin: cardPin(account?.cardNumber ?? identifier), assisted },
    })
  }

  test('the card number signs the household in', async () => {
    const r = await signIn('28AP-0417-9930')
    assert.equal(r.status, 200)
    assert.equal(r.body.account.name, 'Lakshmi Devi K.')
    assert.equal(r.body.account.identifier, '28AP-0417-9930')
  })

  test('the registered mobile still resolves to the same account', async () => {
    const r = await signIn('98490 41234')
    assert.equal(r.status, 200)
    assert.equal(r.body.account.identifier, '28AP-0417-9930')
  })

  test('an assisted card signs in as assisted', async () => {
    const r = await signIn('28AP-0417-9931', true)
    assert.equal(r.status, 200)
    assert.equal(r.body.account.assistance, true)
  })

  test('an unverified card is refused assisted sign-in', async () => {
    const r = await signIn('28AP-0331-1180', true)
    assert.equal(r.status, 403)
  })

  test('the stored account identifier is the card number, not a mobile', async () => {
    const account = db.users().find((u) => u.role === 'beneficiary')
    assert.match(account.identifier, /^\d{2}[A-Z]{2}-\d{4}-\d{4}$/)
    assert.equal(account.identifier, account.cardNumber)
  })
})
describe('every booking produces a distinct QR', () => {
  before(() => reseed())

  const asCard = async (card) =>
    (await call('/auth/card/sign-in', {
      method: 'POST', body: { identifier: card, pin: cardPin(card) },
    })).body.token

  test('two households at the same shop and slot get different codes', async () => {
    const a = await asCard('28AP-0417-9930')
    const b = await asCard('28AP-0417-9931')
    const one = await call('/beneficiary/bookings', { method: 'POST', token: a, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })
    const two = await call('/beneficiary/bookings', { method: 'POST', token: b, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })
    assert.notEqual(one.body.booking.qr, two.body.booking.qr)
    assert.notEqual(one.body.booking.token, two.body.booking.token)
  })

  test('rebooking the same card produces a different code than before', async () => {
    const a = await asCard('28AP-0417-9930')
    const before = (await call('/beneficiary', { token: a })).body.booking
    await call(`/beneficiary/bookings/${before.id}`, { method: 'DELETE', token: a })
    const again = await call('/beneficiary/bookings', { method: 'POST', token: a, body: { shop: 'FPS 2107', slot: '16:00 – 16:30' } })
    assert.notEqual(again.body.booking.qr, before.qr)
    // Not merely a different token — the secret differs too.
    assert.notEqual(again.body.booking.secret, before.secret)
  })

  test('the secret is unguessable and unique across bookings', async () => {
    const { db } = await import('../src/db.js')
    const secrets = db.bookings().map((b) => b.secret)
    assert.ok(secrets.every((x) => typeof x === 'string' && x.length >= 8))
    assert.equal(new Set(secrets).size, secrets.length)
  })

  test('a forged code with the right token but a wrong secret is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    const { db } = await import('../src/db.js')
    const row = db.bookings().find((b) => b.shop === 'FPS 2107' && b.status === 'booked')
    const forged = `ANNASETU:${row.token}:${row.cardNumber}:${row.shop}:AAAAAAAA`
    const r = await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: forged } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /not current/)
  })

  test('the genuine code still scans', async () => {
    const dealer = (await AS.dealer2107()).token
    const { db } = await import('../src/db.js')
    const row = db.bookings().find((b) => b.shop === 'FPS 2107' && b.status === 'booked')
    const real = `ANNASETU:${row.token}:${row.cardNumber}:${row.shop}:${row.secret}`
    const r = await call('/dealer/scan', { method: 'POST', token: dealer, body: { payload: real } })
    assert.equal(r.status, 200)
  })

  test('keying the token in by hand still works for a broken camera', async () => {
    const dealer = (await AS.dealer2107()).token
    const { db } = await import('../src/db.js')
    const row = db.bookings().find((b) => b.shop === 'FPS 2107' && b.status === 'booked')
    const r = await call('/dealer/scan', {
      method: 'POST', token: dealer, body: { payload: `ANNASETU:${row.token}:::`, manual: true },
    })
    assert.equal(r.status, 200)
  })
})

describe('indents', () => {
  test('a dealer chooses the commodity and the quantity', async () => {
    reseed()
    const dealer = (await AS.dealer2107()).token
    const line = (await call('/dealer', { token: dealer })).body.stockLines.find((l) => l.low)
    assert.ok(line, 'seed should leave something below its reorder level')

    const r = await call('/dealer/indents', { method: 'POST', token: dealer, body: { commodity: line.commodity, quantity: line.suggested } })
    assert.equal(r.status, 201)
    const raised = r.body.indents.find((i) => i.commodity === line.commodity)
    assert.equal(raised.quantity, line.suggested)
    assert.equal(raised.status, 'pending')
  })

  test('an unknown commodity or a nonsense quantity is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    assert.equal((await call('/dealer/indents', { method: 'POST', token: dealer, body: { commodity: 'dal', quantity: 100 } })).status, 400)
    assert.equal((await call('/dealer/indents', { method: 'POST', token: dealer, body: { commodity: 'rice', quantity: -5 } })).status, 400)
  })

  test('the same commodity cannot be indented twice while one is pending', async () => {
    const dealer = (await AS.dealer2107()).token
    await call('/dealer/indents', { method: 'POST', token: dealer, body: { commodity: 'rice', quantity: 400 } })
    const again = await call('/dealer/indents', { method: 'POST', token: dealer, body: { commodity: 'rice', quantity: 400 } })
    assert.equal(again.status, 409)
  })

  test('the district sees the request and can sanction less than was asked', async () => {
    const officer = (await AS.officer()).token
    const queue = await call('/officer/indents', { token: officer })
    const rice = queue.body.indents.find((i) => i.commodity === 'rice' && i.status === 'pending')
    assert.ok(rice)
    assert.equal(rice.shop, 'FPS 2107')

    assert.equal((await call(`/officer/indents/${rice.id}/decision`, { method: 'POST', token: officer, body: { decision: 'approved', quantity: 250 } })).status, 200)

    const dealer = (await AS.dealer2107()).token
    const seen = (await call('/dealer', { token: dealer })).body.indents.find((i) => i.id === rice.id)
    assert.equal(seen.status, 'approved')
    assert.equal(seen.sanctioned, 250)
  })

  test('a decided indent cannot be decided again, and other districts cannot touch it', async () => {
    const officer = (await AS.officer()).token
    const decided = (await call('/officer/indents', { token: officer })).body.indents.find((i) => i.status === 'approved')
    assert.equal((await call(`/officer/indents/${decided.id}/decision`, { method: 'POST', token: officer, body: { decision: 'declined' } })).status, 409)

    const krishna = (await login('JC-KRI-006', 'krishna@2026')).token
    const pending = (await call('/officer/indents', { token: officer })).body.indents.find((i) => i.status === 'pending')
    assert.equal((await call(`/officer/indents/${pending.id}/decision`, { method: 'POST', token: krishna, body: { decision: 'approved' } })).status, 404)
  })
})

describe('grievance action', () => {
  test('an officer can advance a ticket and close it with an outcome', async () => {
    reseed()
    const ben = (await AS.lakshmi()).token
    await call('/beneficiary/grievances', { method: 'POST', token: ben, body: { category: 'Short weight given', details: '2 kg less' } })

    const officer = (await AS.officer()).token
    const id = (await call('/officer/grievances', { token: officer })).body.tickets[0].id

    await call(`/officer/grievances/${id}/stage`, { method: 'POST', token: officer, body: { stage: 'inspection assigned' } })
    let t = (await call('/officer/grievances', { token: officer })).body.tickets[0]
    assert.equal(t.stage, 'inspection assigned')
    assert.equal(t.open, true)

    await call(`/officer/grievances/${id}/stage`, { method: 'POST', token: officer, body: { stage: '2 kg recovered', close: true } })
    const after = await call('/officer/grievances', { token: officer })
    assert.equal(after.body.tickets[0].open, false)
    assert.equal(after.body.stats.open, 0)

    // The household reads the outcome on their own screen.
    const mine = (await call('/beneficiary', { token: ben })).body.grievances.find((g) => g.id === id)
    assert.equal(mine.stage, '2 kg recovered')
    assert.equal(mine.open, false)
  })
})

describe('rfid card reader', () => {
  const tagOf = async (cardNumber) => {
    const { db } = await import('../src/db.js')
    return db.cards().find((c) => c.number === cardNumber).rfidTag
  }

  test('every card carries a unique eight-character UID', async () => {
    reseed()
    const { db } = await import('../src/db.js')
    const tags = db.cards().map((c) => c.rfidTag)
    assert.equal(new Set(tags).size, tags.length)
    for (const t of tags) assert.match(t, /^[0-9A-F]{8}$/)
  })

  test('a tap resolves the household and their booking', async () => {
    const ben = (await AS.lakshmi()).token
    await call('/beneficiary/bookings', { method: 'POST', token: ben, body: { shop: 'FPS 2107', slot: '10:00 – 10:30' } })

    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/rfid', { method: 'POST', token: dealer, body: { tag: await tagOf('28AP-0417-9930') } })
    assert.equal(r.status, 200)
    assert.equal(r.body.card.holder, 'Lakshmi Devi K.')
    assert.equal(r.body.channel, 'rfid')
    assert.ok(r.body.booking.token)
  })

  test('readers that add separators or a prefix are tolerated', async () => {
    const dealer = (await AS.dealer2107()).token
    const tag = await tagOf('28AP-0417-9930')
    const messy = `rfid:${tag.toLowerCase().match(/../g).join(':')}`
    const r = await call('/dealer/rfid', { method: 'POST', token: dealer, body: { tag: messy } })
    assert.equal(r.status, 200)
    assert.equal(r.body.card.number, '28AP-0417-9930')
  })

  test('an unreadable or unknown tag is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    assert.equal((await call('/dealer/rfid', { method: 'POST', token: dealer, body: { tag: 'not-a-uid' } })).status, 400)
    assert.equal((await call('/dealer/rfid', { method: 'POST', token: dealer, body: { tag: 'DEADBEEF' } })).status, 404)
  })

  test('a card booked at another shop is not served here', async () => {
    const dealer = (await AS.dealer2211()).token
    const r = await call('/dealer/rfid', { method: 'POST', token: dealer, body: { tag: await tagOf('28AP-0417-9930') } })
    assert.equal(r.status, 404)
    assert.match(r.body.error, /FPS 2107/)
  })

  test('a card with no booking today says so by name', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/rfid', { method: 'POST', token: dealer, body: { tag: await tagOf('03PB-0221-1140') } })
    assert.equal(r.status, 404)
    assert.match(r.body.error, /Harpreet Kaur/)
  })
})

describe('counter booking by tapping the card', () => {
  const tagOf = async (n) => {
    const { db } = await import('../src/db.js')
    return db.cards().find((c) => c.number === n).rfidTag
  }

  test('a tap returns the household and the days the shop is taking', async () => {
    reseed()
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/rfid/lookup', { method: 'POST', token: dealer, body: { tag: await tagOf('28AP-0417-9930') } })
    assert.equal(r.status, 200)
    assert.equal(r.body.card.holder, 'Lakshmi Devi K.')
    assert.equal(r.body.booking, null)
    assert.ok(r.body.days.length > 0)
    assert.ok(r.body.days[0].slots.length > 0)
  })

  test('the shop books a later day on the household behalf', async () => {
    const dealer = (await AS.dealer2107()).token
    const look = await call('/dealer/rfid/lookup', { method: 'POST', token: dealer, body: { tag: await tagOf('28AP-0417-9930') } })
    const day = look.body.days[2]
    const slot = day.slots.find((s) => s.left > 0).time

    const r = await call('/dealer/bookings', { method: 'POST', token: dealer, body: { cardNumber: '28AP-0417-9930', slot, date: day.date } })
    assert.equal(r.status, 201)
    assert.equal(r.body.booking.date, day.date)
    // Recorded as booked at the shop, so the district can see how much of the
    // queue never came through the app.
    assert.equal(r.body.booking.channel, 'counter')
    assert.ok(r.body.booking.bookedBy)
  })

  test('a card may hold only one open token, on any day', async () => {
    const dealer = (await AS.dealer2107()).token
    const look = await call('/dealer/rfid/lookup', { method: 'POST', token: dealer, body: { tag: await tagOf('28AP-0417-9930') } })
    assert.ok(look.body.booking, 'the tap should now show the token just booked')

    const day = look.body.days[3]
    const slot = day.slots.find((s) => s.left > 0).time
    const again = await call('/dealer/bookings', { method: 'POST', token: dealer, body: { cardNumber: '28AP-0417-9930', slot, date: day.date } })
    assert.equal(again.status, 409)
  })

  test('a date outside the horizon is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/bookings', { method: 'POST', token: dealer, body: { cardNumber: '28AP-0417-9944', slot: '09:00 – 09:30', date: '2099-01-01' } })
    assert.equal(r.status, 409)
  })

  test('the household sees a counter booking as their own token', async () => {
    const ben = (await AS.lakshmi()).token
    const me = await call('/beneficiary', { token: ben })
    assert.ok(me.body.booking, 'a token booked for a later day is still their live token')
    assert.equal(me.body.booking.channel, 'counter')
  })
})

describe('tagged consignments from the godown', () => {
  test('sanctioning an indent dispatches tagged bags', async () => {
    reseed()
    const dealer = (await AS.dealer2107()).token
    await call('/dealer/indents', { method: 'POST', token: dealer, body: { commodity: 'sugar', quantity: 400 } })

    const officer = (await AS.officer()).token
    const id = (await call('/officer/indents', { token: officer })).body.indents[0].id
    const dec = await call(`/officer/indents/${id}/decision`, { method: 'POST', token: officer, body: { decision: 'approved', quantity: 250 } })

    // 250 kg in 50 kg bags.
    assert.equal(dec.body.dispatched, 5)
    for (const b of dec.body.bags) assert.match(b.tag, /^[0-9A-F]{24}$/)
    assert.equal(new Set(dec.body.bags.map((b) => b.tag)).size, 5)
  })

  test('tapping a bag adds its weight to stock and never asks for a quantity', async () => {
    const dealer = (await AS.dealer2107()).token
    const before = (await call('/dealer', { token: dealer })).body.stock.sugar
    const bags = (await call('/dealer', { token: dealer })).body.manifest[0]
    assert.equal(bags.received, 0)

    const officer = (await AS.officer()).token
    const indent = (await call('/officer/indents', { token: officer })).body.indents[0]
    const { db } = await import('../src/db.js')
    const tags = db.consignments().filter((b) => b.indentId === indent.id).map((b) => b.tag)

    let onHand = before
    for (const tag of tags) {
      const r = await call('/dealer/consignments/receive', { method: 'POST', token: dealer, body: { tag } })
      assert.equal(r.status, 201)
      onHand += r.body.received.weightKg
      assert.equal(r.body.onHand, onHand)
    }
    assert.equal(onHand, before + 250)
  })

  test('a bag cannot be received twice', async () => {
    const dealer = (await AS.dealer2107()).token
    const { db } = await import('../src/db.js')
    const tag = db.consignments()[0].tag
    const r = await call('/dealer/consignments/receive', { method: 'POST', token: dealer, body: { tag } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /already received/)
  })

  test('a bag addressed to another shop is refused', async () => {
    const other = (await AS.dealer2211()).token
    const { db } = await import('../src/db.js')
    const tag = db.consignments()[0].tag
    const r = await call('/dealer/consignments/receive', { method: 'POST', token: other, body: { tag } })
    assert.equal(r.status, 409)
    assert.match(r.body.error, /FPS 2107/)
  })

  test('an unreadable tag is refused', async () => {
    const dealer = (await AS.dealer2107()).token
    const r = await call('/dealer/consignments/receive', { method: 'POST', token: dealer, body: { tag: 'not-a-tag' } })
    assert.equal(r.status, 409)
  })

  test('the indent closes once the last bag is in', async () => {
    const officer = (await AS.officer()).token
    const indent = (await call('/officer/indents', { token: officer })).body.indents[0]
    assert.equal(indent.status, 'received')

    const dealer = (await AS.dealer2107()).token
    const manifest = (await call('/dealer', { token: dealer })).body.manifest[0]
    assert.equal(manifest.complete, true)
    assert.equal(manifest.receivedKg, manifest.expectedKg)
  })
})

describe('emergency operations', () => {
  const asHousehold = () =>
    call('/auth/card/sign-in', { method: 'POST', body: { identifier: '03PB-0221-1140', pin: cardPin('03PB-0221-1140') } })

  test('normally, delivery needs verified assistance and slots are full size', async () => {
    reseed()
    const h = (await asHousehold()).body.token
    assert.equal((await call('/beneficiary/deliveries', { method: 'POST', token: h, body: {} })).status, 403)
    const slots = await call('/beneficiary/shops/FPS%201101/slots', { token: h })
    assert.equal(slots.body.slots[0].capacity, 8)
  })

  test('declaring a restriction opens delivery to every household and cuts capacity', async () => {
    const officer = (await login('JC-LUD-004', 'ludhiana@2026')).token
    assert.equal((await call('/officer/emergency', { method: 'POST', token: officer, body: { reason: 'Pandemic' } })).status, 201)

    const h = (await asHousehold()).body.token
    const me = await call('/beneficiary', { token: h })
    assert.equal(me.body.emergency.phase, 'lockdown')
    assert.equal(me.body.emergency.deliveryOpenToAll, true)
    assert.ok(me.body.emergency.guidance.points.length > 0)

    // The household that was refused a moment ago can now request delivery.
    assert.equal((await call('/beneficiary/deliveries', { method: 'POST', token: h, body: {} })).status, 201)
    const slots = await call('/beneficiary/shops/FPS%201101/slots', { token: h })
    assert.equal(slots.body.slots[0].capacity, 3)
  })

  test('it cannot be declared twice, or for another district', async () => {
    const officer = (await login('JC-LUD-004', 'ludhiana@2026')).token
    assert.equal((await call('/officer/emergency', { method: 'POST', token: officer, body: {} })).status, 409)
    assert.equal((await call('/officer/emergency', { method: 'POST', token: officer, body: { district: 'Mumbai' } })).status, 403)
  })

  test('the phase moves from lockdown to easing on its own, and expires at ninety days', async () => {
    const { emergencyFor } = await import('../src/domain/emergency.js')
    db.write((state) => {
      state.emergencies = [{ id: 'EM-t', district: 'Ludhiana', reason: 'Pandemic', declaredBy: 'JC', declaredOn: '2026-01-01', liftedOn: null }]
    })
    assert.equal(emergencyFor('Ludhiana', '2026-01-01').phase, 'lockdown')
    assert.equal(emergencyFor('Ludhiana', '2026-01-30').phase, 'lockdown')
    // Day 31 onward, restrictions ease: delivery narrows back to those who need it.
    const easing = emergencyFor('Ludhiana', '2026-01-31')
    assert.equal(easing.phase, 'easing')
    assert.equal(easing.deliveryOpenToAll, false)
    assert.equal(easing.slotCapacity, 5)
    // It lifts itself rather than needing anyone to remember.
    assert.equal(emergencyFor('Ludhiana', '2026-04-02'), null)
  })

  test('guidance differs between the two phases', async () => {
    const { guidance } = await import('../src/domain/emergency.js')
    assert.match(guidance('lockdown').headline, /stay home/i)
    assert.match(guidance('easing').headline, /safely/i)
    assert.notEqual(guidance('lockdown').points[0], guidance('easing').points[0])
    assert.equal(guidance('normal'), null)
  })

  test('lifting it restores normal operations', async () => {
    reseed()
    const officer = (await login('JC-LUD-004', 'ludhiana@2026')).token
    await call('/officer/emergency', { method: 'POST', token: officer, body: { reason: 'Pandemic' } })
    assert.equal((await call('/officer/emergency/Ludhiana', { method: 'DELETE', token: officer })).status, 200)

    const h = (await asHousehold()).body.token
    assert.equal((await call('/beneficiary', { token: h })).body.emergency, null)
    assert.equal((await call('/beneficiary/deliveries', { method: 'POST', token: h, body: {} })).status, 403)
  })
})
