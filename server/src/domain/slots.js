import { config } from '../config.js'
import { emergencyForShop } from './emergency.js'
import { db } from '../db.js'
import { isVerified } from './assistance.js'
import { today } from './cycle.js'

// Slot templates are per shop, derived from its declared opening hours.
export const SLOT_TIMES = [
  '09:00 – 09:30',
  '10:00 – 10:30',
  '11:00 – 11:30',
  '16:00 – 16:30',
  '17:00 – 17:30',
]

const activeStatuses = new Set(['booked', 'served'])

export const bookingsFor = (shopCode, date = today()) =>
  db.bookings().filter((b) => b.shop === shopCode && b.date === date && activeStatuses.has(b.status))

export function slotAvailability(shopCode, date = today()) {
  const taken = bookingsFor(shopCode, date)
  // Under a declared restriction a shop takes fewer households per slot, so
  // the few who must attend are never in a crowd.
  const emergency = emergencyForShop(shopCode, date)
  const capacity = emergency?.slotCapacity ?? config.slotCapacity
  return SLOT_TIMES.map((time) => {
    const booked = taken.filter((b) => b.slot === time).length
    return {
      time,
      capacity,
      booked,
      left: Math.max(0, capacity - booked),
    }
  })
}

// Tokens are sequential per shop per day, which is what a queue number is.
export function nextToken(shopCode, date = today()) {
  const used = db
    .bookings()
    .filter((b) => b.shop === shopCode && b.date === date)
    .map((b) => Number(String(b.token).replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `T-${String(next).padStart(3, '0')}`
}

export const qrPayload = (booking) =>
  `ANNASETU:${booking.token}:${booking.cardNumber}:${booking.shop}:${booking.secret ?? ''}`

// A ration card carries an RFID tag; readers present its UID. Most USB readers
// are keyboard-wedge devices that simply type the UID, so the same field
// accepts a tap or a typed code. Real MIFARE Classic UIDs are four bytes, so
// eight hex characters is what a reader hands over. A reader that prefixes the
// read is tolerated, since not all of them are configurable.
export function parseTag(input) {
  const raw = String(input ?? '').trim().toUpperCase().replace(/^RFID:/, '').replace(/[\s:-]/g, '')
  return /^[0-9A-F]{8}$/.test(raw) ? raw : null
}

// The UID printed on a card. Derived from the card number so it is stable
// across reseeds — a physical card cannot be reissued every time the demo is
// reset.
export function tagFor(cardNumber) {
  let h = 0x811c9dc5
  for (const ch of String(cardNumber)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).toUpperCase().padStart(8, '0')
}

export function parseQr(payload) {
  const parts = String(payload ?? '').split(':')
  if (parts[0] !== 'ANNASETU' || !parts[1]) return null
  return {
    token: parts[1],
    cardNumber: parts[2] || null,
    shop: parts[3] || null,
    secret: parts[4] || null,
  }
}

// The dealer's queue: every active booking at this shop today, ordered by slot
// then by when it was made, with the cardholder's name resolved.
export function queueFor(shopCode, date = today()) {
  return bookingsFor(shopCode, date)
    .map((b) => {
      const card = db.card(b.cardNumber)
      return {
        id: b.id,
        token: b.token,
        slot: b.slot,
        status: b.status,
        cardNumber: b.cardNumber,
        holder: card?.holder ?? 'Unknown cardholder',
        members: card?.members ?? 0,
        scheme: card?.scheme ?? '—',
        assistance: isVerified(card),
        // Lets the counter demonstrate a tap when no reader is plugged in.
        rfidTag: card?.rfidTag ?? null,
        channel: b.channel ?? 'app',
        bookedAt: b.createdAt,
      }
    })
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.bookedAt.localeCompare(b.bookedAt))
}

export const activeBookingForCard = (cardNumber, date = today()) =>
  db.bookings().find((b) => b.cardNumber === cardNumber && b.date === date && b.status === 'booked') ??
  null

// A card may hold only one open token at a time, on any day — otherwise a
// household could reserve every slot in the week and strand the queue.
export const openBookingForCard = (cardNumber) =>
  db
    .bookings()
    .filter((b) => b.cardNumber === cardNumber && b.status === 'booked' && b.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
