import { Router } from 'express'
import { db } from '../db.js'
import { config } from '../config.js'
import { requireRole } from '../auth/middleware.js'
import { currentCycle, today } from '../domain/cycle.js'
import { collectionFor, entitlementRows } from '../domain/entitlement.js'
import { openBookingForCard, slotAvailability } from '../domain/slots.js'
import { CHANNELS, cancelBooking, createBooking } from '../domain/booking.js'
import { assistanceState } from '../domain/assistance.js'

const router = Router()
router.use(requireRole('helpline'))

const digits = (v) => String(v ?? '').replace(/\D/g, '')

// An operator has a caller on the line and knows one of two things: the number
// they are calling from, or the number printed on the card.
function findCard(query) {
  const raw = String(query ?? '').trim()
  if (!raw) return null
  const asDigits = digits(raw)
  return (
    db.cards().find((c) => c.number.toLowerCase() === raw.toLowerCase()) ??
    (asDigits.length >= 10
      ? db.cards().find((c) => digits(c.mobile).endsWith(asDigits.slice(-10)))
      : null) ??
    null
  )
}

router.get('/lookup', (req, res) => {
  const card = findCard(req.query.q)
  if (!card) {
    return res.status(404).json({
      error: 'No ration card matches that number. Check the card number or the mobile on the card.',
    })
  }

  const booking = openBookingForCard(card.number)
  const collection = collectionFor(card.number, currentCycle())

  // Shops in the household's own district first — an operator on the phone
  // cannot see where the caller is standing.
  const shops = db
    .shops()
    .filter((s) => s.district === card.district)
    .map((s) => ({
      code: s.code,
      name: s.name,
      address: s.address,
      mandal: s.mandal,
      linked: s.code === card.shop,
      slots: slotAvailability(s.code),
    }))
    .sort((a, b) => Number(b.linked) - Number(a.linked))

  res.json({
    card: {
      number: card.number,
      holder: card.holder,
      scheme: card.scheme,
      members: card.members,
      mobile: card.mobile,
      address: card.address,
      district: card.district,
      mandal: card.mandal,
      shop: card.shop,
      assistance: assistanceState(card),
    },
    entitlement: entitlementRows(card),
    collected: Boolean(collection),
    receipt: collection,
    booking,
    shops,
    date: today(),
  })
})

router.post('/bookings', (req, res) => {
  const { cardNumber, shop, slot, channel = CHANNELS.phone } = req.body ?? {}
  const allowed = [CHANNELS.phone, CHANNELS.sms]
  if (!allowed.includes(channel)) {
    return res.status(400).json({ error: 'A helpline booking must be recorded as phone or sms.' })
  }

  const result = createBooking({ cardNumber, shop, slot, channel, bookedBy: req.user.id })
  if (result.error) {
    return res.status(/Unknown/.test(result.error) ? 400 : 409).json({ error: result.error })
  }

  // The operator reads this back to the caller, so it carries everything that
  // has to be said out loud.
  res.status(201).json({
    booking: result.booking,
    readBack: {
      token: result.booking.token,
      slot: result.booking.slot,
      shop: result.booking.shop,
      holder: result.card.holder,
      instruction: `Token ${result.booking.token.replace('T-', '')}, at ${result.booking.shop}, between ${result.booking.slot}. Carry the ration card.`,
    },
  })
})

router.delete('/bookings/:id', (req, res) => {
  const result = cancelBooking({ id: req.params.id })
  if (result.error) {
    return res.status(/No such/.test(result.error) ? 404 : 409).json({ error: result.error })
  }
  res.json({ ok: true })
})

// What this operator has booked today, so a caller ringing back can be found.
router.get('/recent', (req, res) => {
  const rows = db
    .bookings()
    .filter((b) => b.bookedBy === req.user.id && b.date === today())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((b) => ({
      ...b,
      holder: db.card(b.cardNumber)?.holder ?? 'Unknown',
    }))
  res.json({ bookings: rows, helpline: config.helpline })
})

export default router
