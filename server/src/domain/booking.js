import { randomBytes } from 'node:crypto'
import { db } from '../db.js'
import { bookableDates, currentCycle, today } from './cycle.js'
import { collectionFor } from './entitlement.js'
import { openBookingForCard, qrPayload, slotAvailability } from './slots.js'

// Booking rules live here, not in a route, because the same rules must apply
// whether a household books in the app or a helpline operator books for them
// over the phone. Anything else creates two classes of beneficiary.
export const CHANNELS = {
  app: 'app',
  phone: 'phone',      // helpline operator, spoken
  sms: 'sms',          // helpline operator, from an SMS request
  counter: 'counter',  // booked at the shop itself
}

export function createBooking({
  cardNumber,
  shop: shopCode,
  slot,
  // A household at the counter is usually booking for a later day, so the date
  // is part of the request rather than always today.
  date = today(),
  channel = CHANNELS.app,
  bookedBy = null,
}) {
  const card = db.card(cardNumber)
  if (!card) return { error: 'Unknown ration card.' }

  const shop = db.shop(shopCode)
  if (!shop) return { error: 'Unknown fair price shop.' }

  if (collectionFor(card.number, currentCycle())) {
    return { error: 'This card has already collected in the current cycle.' }
  }
  const open = openBookingForCard(card.number)
  if (open) {
    return {
      error:
        open.date === today()
          ? 'A token is already booked against this card today.'
          : `A token is already booked against this card for ${open.date}.`,
    }
  }

  if (!bookableDates().includes(date)) {
    return { error: 'That date is outside the days this shop is taking bookings for.' }
  }

  const availability = slotAvailability(shop.code, date).find((s) => s.time === slot)
  if (!availability) return { error: 'Unknown slot.' }
  if (availability.left <= 0) return { error: 'That slot is now full.' }

  const booking = db.write((state) => {
    // The token is allocated inside the write so two bookings arriving at the
    // same moment — one from the app, one from the helpline — cannot collide.
    const used = state.bookings
      .filter((b) => b.shop === shop.code && b.date === date)
      .map((b) => Number(String(b.token).replace(/\D/g, '')))
      .filter(Number.isFinite)
    const token = `T-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`

    const row = {
      id: `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      token,
      // Unique per booking: cancelling and rebooking produces a different code,
      // and a token number alone is not enough to forge one.
      secret: randomBytes(6).toString('base64url'),
      cardNumber: card.number,
      shop: shop.code,
      slot,
      date,
      status: 'booked',
      channel,
      bookedBy,
      createdAt: new Date().toISOString(),
    }
    state.bookings.push(row)
    return row
  })

  return { booking: { ...booking, qr: qrPayload(booking) }, card }
}

export function cancelBooking({ id, cardNumber = null }) {
  const booking = db.bookings().find((b) => b.id === id)
  if (!booking) return { error: 'No such booking.' }
  if (cardNumber && booking.cardNumber !== cardNumber) {
    return { error: 'That booking belongs to another card.' }
  }
  if (booking.status !== 'booked') return { error: 'That booking can no longer be cancelled.' }

  db.write((state) => {
    state.bookings.find((b) => b.id === booking.id).status = 'cancelled'
  })
  return { ok: true }
}

// How people are reaching the system — the number that tells you whether the
// offline channel is actually being used or is just decoration.
export function channelBreakdown(shopCodes = null) {
  const rows = db.bookings().filter((b) => !shopCodes || shopCodes.has(b.shop))
  const counts = rows.reduce((acc, b) => {
    const key = b.channel ?? 'app'
    return { ...acc, [key]: (acc[key] ?? 0) + 1 }
  }, {})
  return { total: rows.length, counts }
}
