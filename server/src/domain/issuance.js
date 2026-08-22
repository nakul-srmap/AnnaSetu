import { db } from '../db.js'
import { currentCycle } from './cycle.js'
import { collectionFor, entitlementFor, priceFor } from './entitlement.js'

const round2 = (n) => Math.round(n * 100) / 100

// The rule the client cannot bypass: quantities must be real numbers, within
// the card's entitlement for this cycle, and within what the shop holds.
export function validateIssue({ booking, card, shop, quantities }) {
  if (!booking) return { error: 'No booking to serve.' }
  if (booking.status !== 'booked') return { error: 'That token has already been served.' }
  if (!card) return { error: 'Unknown ration card.' }
  if (collectionFor(card.number, currentCycle())) {
    return { error: 'This card has already collected in the current cycle.' }
  }

  const due = entitlementFor(card)
  const clean = {}

  for (const key of Object.keys(due)) {
    const value = Number(quantities?.[key])
    if (!Number.isFinite(value) || value < 0) {
      return { error: `Quantity for ${key} is not a valid weight.` }
    }
    if (value > due[key]) {
      return { error: `Cannot issue ${value} kg of ${key} — entitlement is ${due[key]} kg.` }
    }
    if (value > (shop.stock[key] ?? 0)) {
      return { error: `Only ${shop.stock[key] ?? 0} kg of ${key} on hand at ${shop.code}.` }
    }
    clean[key] = round2(value)
  }

  return { quantities: clean, payable: priceFor(clean) }
}

export function recordIssue({ booking, card, shop, quantities, payable, dealerId }) {
  return db.write((state) => {
    const transaction = {
      id: `TX-${Date.now().toString().slice(-8)}`,
      token: booking.token,
      cardNumber: card.number,
      shop: shop.code,
      dealerId,
      quantities,
      payable,
      cycle: currentCycle(),
      date: booking.date,
      issuedAt: new Date().toISOString(),
      device: shop.device ?? 'ePoS',
    }
    state.transactions.push(transaction)

    const target = state.bookings.find((b) => b.id === booking.id)
    target.status = 'served'
    target.servedAt = transaction.issuedAt
    target.transactionId = transaction.id

    const shopRow = state.shops.find((s) => s.code === shop.code)
    for (const [key, value] of Object.entries(quantities)) {
      shopRow.stock[key] = round2((shopRow.stock[key] ?? 0) - value)
    }

    return transaction
  })
}
