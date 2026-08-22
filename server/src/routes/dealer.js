import { Router } from 'express'
import { db } from '../db.js'
import { requireRole } from '../auth/middleware.js'
import { bookableDates, currentCycle, today } from '../domain/cycle.js'
import { collectionFor, entitlementFor, entitlementRows } from '../domain/entitlement.js'
import { CHANNELS, createBooking } from '../domain/booking.js'
import { openBookingForCard, parseQr, parseTag, queueFor, slotAvailability } from '../domain/slots.js'
import { recordIssue, validateIssue } from '../domain/issuance.js'
import { COMMODITIES, stockLines, suggestedIndent } from '../domain/stock.js'
import { manifestFor, receiveBag, todayReceipts } from '../domain/consignment.js'
import { hasPin, setPin } from '../domain/pin.js'

const router = Router()
router.use(requireRole('dealer'))

const shopOf = (req) => db.shop(req.user.shopCode)

function view(shop) {
  const queue = queueFor(shop.code)
  return {
    shop: {
      code: shop.code,
      name: shop.name,
      dealer: shop.dealer,
      licence: shop.licence,
      timings: shop.timings,
      weeklyClosing: shop.weeklyClosing,
      device: shop.device,
      staff: shop.staff,
    },
    date: today(),
    queue,
    waiting: queue.filter((q) => q.status === 'booked').length,
    served: queue.filter((q) => q.status === 'served').length,
    slots: slotAvailability(shop.code),
    stock: shop.stock,
    opening: shop.opening,
    stockLines: stockLines(shop),
    manifest: manifestFor(shop.code),
    receivedToday: todayReceipts(shop.code).map((b) => ({
      tag: b.tag, commodity: b.commodity, weightKg: b.weightKg, receivedAt: b.receivedAt,
    })),
    transactions: db
      .transactions()
      .filter((t) => t.shop === shop.code && t.date === today())
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    deliveries: db.deliveries().filter((d) => d.shop === shop.code),
    indents: db.indents().filter((i) => i.shop === shop.code),
  }
}

router.get('/', (req, res) => res.json(view(shopOf(req))))

// Lightweight endpoint the portal polls: just enough to know whether the queue
// changed, so a booking made seconds ago shows up without a page reload.
router.get('/queue', (req, res) => {
  const shop = shopOf(req)
  const queue = queueFor(shop.code)
  res.json({
    queue,
    waiting: queue.filter((q) => q.status === 'booked').length,
    served: queue.filter((q) => q.status === 'served').length,
    updatedAt: new Date().toISOString(),
  })
})

// Resolves a scanned QR (or a manually keyed token) to a booking at THIS shop.
router.post('/scan', (req, res) => {
  const shop = shopOf(req)
  const { payload, manual = false } = req.body ?? {}
  const parsed = parseQr(payload)

  if (!parsed) return res.status(400).json({ error: 'That code is not an Anna Setu token.' })

  // Tokens are sequential per shop, so T-001 exists at every shop. The payload
  // carries the shop it was issued for; refuse anything issued elsewhere before
  // looking up a local booking that happens to share the number.
  if (parsed.shop && parsed.shop !== shop.code) {
    return res.status(404).json({
      error: `Token ${parsed.token} was issued for ${parsed.shop}, not ${shop.code}.`,
    })
  }

  const booking = db
    .bookings()
    .find((b) => b.token === parsed.token && b.shop === shop.code && b.date === today())

  if (!booking) {
    const elsewhere = db.bookings().find((b) => b.token === parsed.token && b.date === today())
    return res.status(404).json({
      error: elsewhere
        ? `Token ${parsed.token} is booked at ${elsewhere.shop}, not ${shop.code}.`
        : `No booking found for token ${parsed.token} at ${shop.code} today.`,
    })
  }
  if (booking.status === 'served') {
    return res.status(409).json({ error: `Token ${booking.token} has already been served.` })
  }
  if (booking.status === 'cancelled') {
    return res.status(409).json({ error: `Token ${booking.token} was cancelled.` })
  }

  // Whose card the token belongs to is the more useful thing to say, so check
  // it before anything about the code's format.
  if (parsed.cardNumber && parsed.cardNumber !== booking.cardNumber) {
    return res.status(409).json({
      error: `Token ${booking.token} at ${shop.code} belongs to a different ration card.`,
    })
  }

  // A scanned code must carry the booking's secret. Typing a token by hand is
  // still allowed — it is already recorded as an exception — but a scan that
  // presents the wrong secret is a forged or stale code.
  if (parsed.secret && booking.secret && parsed.secret !== booking.secret) {
    return res.status(409).json({
      error: `That code is not current for token ${booking.token}. Ask for the token to be reopened on their phone.`,
    })
  }
  if (!manual && booking.secret && !parsed.secret) {
    return res.status(409).json({
      error: 'That code is missing its verification field. Re-scan, or key the token in by hand.',
    })
  }

  const card = db.card(booking.cardNumber)
  if (manual) {
    db.write((state) => {
      state.scanExceptions.push({
        shop: shop.code,
        token: booking.token,
        at: new Date().toISOString(),
      })
    })
  }

  res.json({ ...resolved(booking, card), manual, channel: manual ? 'manual' : 'qr' })
})

// The shape both the scanner and the card reader return, so the counter screen
// does not care which one identified the household.
function resolved(booking, card) {
  return {
    booking: { id: booking.id, token: booking.token, slot: booking.slot, status: booking.status },
    card: {
      number: card.number,
      holder: card.holder,
      scheme: card.scheme,
      members: card.members,
      family: card.family,
      assistance: card.assistance,
    },
    entitlement: entitlementRows(card),
    entitled: entitlementFor(card),
  }
}

// Tapping the ration card on the reader at the counter.
//
// An RFID tag identifies a CARD, not a PERSON: anyone holding it reads the
// same UID. So this resolves the household and stops there — the dealer still
// confirms identity on the next screen, exactly as with a scanned token, and
// the transaction records that the card was read rather than the token
// scanned. It is a faster way to find the booking, not a weaker way to prove
// who is collecting.
router.post('/rfid', (req, res) => {
  const shop = shopOf(req)
  const uid = parseTag(req.body?.tag)
  if (!uid) {
    return res.status(400).json({ error: 'That is not a card UID. Tap the card again.' })
  }

  const card = db.cards().find((c) => c.rfidTag === uid)
  if (!card) {
    return res.status(404).json({ error: `No ration card is registered to tag ${uid}.` })
  }

  const booking = db
    .bookings()
    .find((b) => b.cardNumber === card.number && b.date === today() && b.status !== 'cancelled')

  if (!booking) {
    return res.status(404).json({
      error: `${card.holder} has no booking today. Ask them to book a slot, or key the token in by hand.`,
      card: { number: card.number, holder: card.holder },
    })
  }
  if (booking.shop !== shop.code) {
    return res.status(404).json({
      error: `${card.holder} is booked at ${booking.shop}, not ${shop.code}.`,
    })
  }
  if (booking.status === 'served') {
    return res.status(409).json({ error: `${card.holder} has already collected today.` })
  }

  res.json({ ...resolved(booking, card), manual: false, channel: 'rfid' })
})

// Booking at the counter, for a household that has no smartphone.
//
// They tap their ration card on the reader and the shop books a slot for them,
// on a later day if today is full. This is the same createBooking used by the
// app and the helpline — one set of rules, so a household that walks in is not
// a second-class beneficiary.
router.post('/rfid/lookup', (req, res) => {
  const shop = shopOf(req)
  const uid = parseTag(req.body?.tag)
  if (!uid) return res.status(400).json({ error: 'That is not a card UID. Tap the card again.' })

  const card = db.cards().find((c) => c.rfidTag === uid)
  if (!card) return res.status(404).json({ error: `No ration card is registered to tag ${uid}.` })

  const existing = openBookingForCard(card.number)
  const collected = Boolean(collectionFor(card.number, currentCycle()))

  res.json({
    card: {
      number: card.number,
      holder: card.holder,
      scheme: card.scheme,
      members: card.members,
      shop: card.shop,
      assistance: card.assistance,
    },
    // Everything the counter needs to decide what to offer, in one read.
    collected,
    booking: existing
      ? { token: existing.token, slot: existing.slot, date: existing.date, shop: existing.shop }
      : null,
    entitlement: entitlementRows(card),
    days: bookableDates().map((date) => ({
      date,
      slots: slotAvailability(shop.code, date),
    })),
  })
})

router.post('/bookings', (req, res) => {
  const shop = shopOf(req)
  const { tag, cardNumber, slot, date } = req.body ?? {}

  // Either a tapped card or a keyed number identifies the household.
  const card = tag
    ? db.cards().find((c) => c.rfidTag === parseTag(tag))
    : db.card(cardNumber)
  if (!card) return res.status(404).json({ error: 'No ration card matched that card or number.' })

  const result = createBooking({
    cardNumber: card.number,
    shop: shop.code,
    slot,
    date,
    channel: CHANNELS.counter,
    bookedBy: req.user.name,
  })
  if (result.error) return res.status(409).json({ error: result.error })

  res.status(201).json({
    booking: result.booking,
    card: { number: card.number, holder: card.holder },
    ...view(db.shop(shop.code)),
  })
})

// Tapping a bag as it comes off the truck.
router.post('/consignments/receive', (req, res) => {
  const shop = shopOf(req)
  const result = receiveBag({ tag: req.body?.tag, shopCode: shop.code, dealerName: req.user.name })
  if (result.error) return res.status(409).json({ error: result.error })

  res.status(201).json({
    received: {
      tag: result.bag.tag,
      commodity: result.bag.commodity,
      weightKg: result.bag.weightKg,
    },
    outstanding: result.outstanding,
    onHand: result.onHand,
    ...view(db.shop(shop.code)),
  })
})

// Setting or resetting a household's PIN, in person at the counter.
//
// This is the whole trust model: the dealer is looking at the person and their
// card, which is the same check that issues a ration card in the first place.
// It is also why losing a PIN is not a crisis — it is a walk to the shop, not
// a message that may never arrive.
router.post('/cards/:number/pin', (req, res) => {
  const shop = shopOf(req)
  const card = db.card(req.params.number)
  if (!card) return res.status(404).json({ error: 'Unknown ration card.' })

  // A shop may only set a PIN for a card linked to it, so one dealer cannot
  // take over households belonging to another shop.
  if (card.shop !== shop.code) {
    return res.status(403).json({ error: `That card is linked to ${card.shop}, not ${shop.code}.` })
  }

  const result = setPin(card.number, req.body?.pin)
  if (result.error) return res.status(400).json({ error: result.error })

  res.status(201).json({
    ok: true,
    card: { number: card.number, holder: card.holder },
  })
})

// Whether the households at this shop have a PIN yet, so a dealer can see who
// still needs setting up rather than waiting for them to be turned away.
router.get('/cards/pin-status', (req, res) => {
  const shop = shopOf(req)
  res.json({
    cards: db
      .cards()
      .filter((c) => c.shop === shop.code)
      .map((c) => ({ number: c.number, holder: c.holder, hasPin: hasPin(c.number) })),
  })
})

router.post('/transactions', (req, res) => {
  const shop = shopOf(req)
  const { bookingId, token, quantities } = req.body ?? {}

  const booking = db
    .bookings()
    .find(
      (b) =>
        b.shop === shop.code &&
        b.date === today() &&
        (bookingId ? b.id === bookingId : b.token === token),
    )
  if (!booking) return res.status(404).json({ error: 'No such booking at this shop today.' })

  const card = db.card(booking.cardNumber)
  const check = validateIssue({ booking, card, shop, quantities })
  if (check.error) return res.status(422).json({ error: check.error })

  const receipt = recordIssue({
    booking,
    card,
    shop,
    quantities: check.quantities,
    payable: check.payable,
    dealerId: req.user.id,
  })

  res.status(201).json({ receipt, ...view(db.shop(shop.code)) })
})

// The dealer chooses what to indent for and how much. It used to be a fixed
// 380 kg of sugar regardless of what was actually short.
router.post('/indents', (req, res) => {
  const shop = shopOf(req)
  const { commodity, quantity, note = '' } = req.body ?? {}

  if (!COMMODITIES.includes(commodity)) {
    return res.status(400).json({ error: `Choose one of: ${COMMODITIES.join(', ')}.` })
  }
  const amount = Number(quantity ?? suggestedIndent(shop, commodity))
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number of kilograms.' })
  }
  // A shop cannot ask for more than one godown load of a commodity at a time;
  // duplicate indents are how a queue at the district becomes unreadable.
  if (db.indents().some((i) => i.shop === shop.code && i.commodity === commodity && i.status === 'pending')) {
    return res.status(409).json({ error: `An indent for ${commodity} is already awaiting a decision.` })
  }

  db.write((state) => {
    state.indents.push({
      id: `IN-${state.indents.length + 5520}`,
      shop: shop.code,
      commodity,
      quantity: amount,
      note,
      onHandWhenRaised: shop.stock?.[commodity] ?? 0,
      status: 'pending',
      raisedAt: new Date().toISOString(),
    })
  })
  res.status(201).json(view(db.shop(shop.code)))
})

router.post('/deliveries/:id/assign', (req, res) => {
  const shop = shopOf(req)
  const { partner = 'Yesu Babu' } = req.body ?? {}
  const delivery = db.deliveries().find((d) => d.id === req.params.id && d.shop === shop.code)
  if (!delivery) return res.status(404).json({ error: 'No such delivery request at this shop.' })

  db.write((state) => {
    const row = state.deliveries.find((d) => d.id === delivery.id)
    row.status = 'assigned'
    row.partner = partner
    row.assignedAt = new Date().toISOString()
  })
  res.json(view(db.shop(shop.code)))
})

export default router
