import { Router } from 'express'
import { db } from '../db.js'
import { requireRole, requireAssistance } from '../auth/middleware.js'
import { currentCycle, today } from '../domain/cycle.js'
import { collectionFor, entitlementFor, entitlementRows } from '../domain/entitlement.js'
import { openBookingForCard, qrPayload, slotAvailability } from '../domain/slots.js'
import { CHANNELS, cancelBooking, createBooking } from '../domain/booking.js'
import { GROUNDS, applyForAssistance, assistanceState } from '../domain/assistance.js'
import { distanceKm, locateAgainst, parseCoords } from '../domain/geo.js'

const router = Router()
router.use(requireRole('beneficiary'))

function cardOf(req) {
  const card = db.card(req.user.cardNumber)
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 })
  return card
}

// Everything the beneficiary's portal needs, and nothing about other cards,
// other shops' stock, or district totals.
function view(card) {
  const booking = openBookingForCard(card.number)
  const collection = collectionFor(card.number, currentCycle())
  const shop = db.shop(card.shop)

  return {
    card: {
      number: card.number,
      holder: card.holder,
      scheme: card.scheme,
      members: card.members,
      address: card.address,
      mobile: card.mobile,
      shop: card.shop,
      family: card.family,
      assistance: card.assistance,
      rfidTag: card.rfidTag ?? null,
    },
    linkedShop: shop
      ? { code: shop.code, name: shop.name, timings: shop.timings, weeklyClosing: shop.weeklyClosing }
      : null,
    cycle: currentCycle(),
    entitlement: entitlementRows(card),
    entitled: entitlementFor(card),
    collected: Boolean(collection),
    receipt: collection,
    booking: booking
      ? { ...booking, qr: qrPayload(booking), position: queuePosition(booking) }
      : null,
    history: db
      .transactions()
      .filter((t) => t.cardNumber === card.number)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .slice(0, 12),
    assistance: assistanceState(card),
    assistanceGrounds: GROUNDS,
    grievances: db.grievances().filter((g) => g.cardNumber === card.number),
    deliveries: db.deliveries().filter((d) => d.cardNumber === card.number),
  }
}

// How many people are ahead of you in the same slot.
function queuePosition(booking) {
  const sameSlot = db
    .bookings()
    .filter(
      (b) =>
        b.shop === booking.shop &&
        b.date === booking.date &&
        b.slot === booking.slot &&
        b.status === 'booked',
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return sameSlot.findIndex((b) => b.id === booking.id) + 1
}

router.get('/', (req, res) => res.json(view(cardOf(req))))

router.get('/shops', (req, res) => {
  const card = cardOf(req)
  const all = db.shops()

  // A position, when the household shares one, ranks shops by real distance.
  // Without it we fall back to the district on the card — never a fixed place.
  const coords = parseCoords(req.query)
  const located = coords ? locateAgainst(all, coords) : null

  const shops = all
    .map((s) => {
      const slots = slotAvailability(s.code)
      return {
        code: s.code,
        name: s.name,
        address: s.address,
        district: s.district,
        mandal: s.mandal,
        timings: s.timings,
        lat: s.lat,
        lng: s.lng,
        linked: s.code === card.shop,
        distanceKm: coords ? distanceKm(coords, s) : null,
        waiting: slots.reduce((n, slot) => n + slot.booked, 0),
        openSlots: slots.filter((slot) => slot.left > 0).length,
        inStock: Object.entries(s.stock).filter(([, v]) => v > 0).map(([k]) => k),
      }
    })
    .sort((a, b) => {
      if (coords) return a.distanceKm - b.distanceKm
      if (a.linked !== b.linked) return a.linked ? -1 : 1
      const home = card.district
      const rank = (x) => (x.district === home ? 0 : 1)
      return rank(a) - rank(b) || a.code.localeCompare(b.code)
    })

  res.json({
    shops,
    located,
    // What the portal should call the place it is showing.
    area: located
      ? { district: located.district, mandal: located.mandal, source: 'position' }
      : { district: card.district, mandal: card.mandal, source: 'card' },
  })
})

router.get('/shops/:code/slots', (req, res) => {
  const shop = db.shop(req.params.code)
  if (!shop) return res.status(404).json({ error: 'No such fair price shop.' })
  res.json({
    shop: { code: shop.code, name: shop.name },
    date: today(),
    slots: slotAvailability(shop.code),
  })
})

router.post('/bookings', (req, res) => {
  const card = cardOf(req)
  const { shop, slot } = req.body ?? {}

  const result = createBooking({
    cardNumber: card.number,
    shop,
    slot,
    channel: CHANNELS.app,
    bookedBy: req.user.id,
  })
  if (result.error) {
    const status = /Unknown/.test(result.error) ? 400 : 409
    return res.status(status).json({ error: result.error })
  }

  res.status(201).json({ booking: result.booking, ...view(card) })
})

router.delete('/bookings/:id', (req, res) => {
  const card = cardOf(req)
  const result = cancelBooking({ id: req.params.id, cardNumber: card.number })
  if (result.error) {
    return res.status(/No such/.test(result.error) ? 404 : 409).json({ error: result.error })
  }
  res.json(view(card))
})

// Applying is open to any household; approval is not.
router.post('/assistance', (req, res) => {
  const card = cardOf(req)
  const { ground, memberName, documentRef, note } = req.body ?? {}
  const result = applyForAssistance({
    cardNumber: card.number,
    ground,
    memberName,
    documentRef,
    note,
  })
  if (result.error) {
    return res.status(/Unknown/.test(result.error) ? 404 : 409).json({ error: result.error })
  }
  res.status(201).json(view(db.card(card.number)))
})

router.post('/grievances', (req, res) => {
  const card = cardOf(req)
  const { category = 'Short weight given', shop = card.shop, details = '' } = req.body ?? {}
  const collection = collectionFor(card.number, currentCycle())

  db.write((state) => {
    state.grievances.push({
      id: `GR-${String(state.grievances.length + 3391)}`,
      cardNumber: card.number,
      holder: card.holder,
      category,
      shop,
      details,
      transactionId: collection?.id ?? null,
      stage: 'received',
      open: true,
      filedAt: new Date().toISOString(),
    })
  })
  res.status(201).json(view(card))
})

router.post('/deliveries', requireAssistance, (req, res) => {
  const card = req.card
  const { address = card.address, window: slot = 'Tomorrow, 9 AM – 12 PM' } = req.body ?? {}

  db.write((state) => {
    state.deliveries.push({
      id: `DR-${String(state.deliveries.length + 8841)}`,
      cardNumber: card.number,
      holder: card.holder,
      shop: card.shop,
      address,
      window: slot,
      status: 'requested',
      requestedAt: new Date().toISOString(),
    })
  })
  res.status(201).json(view(card))
})

export default router
