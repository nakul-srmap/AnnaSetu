import { db } from '../db.js'
import { currentCycle } from './cycle.js'

// NFSA norms: PHH is 5 kg of foodgrain per member per month; AAY is a flat
// 35 kg per household. Wheat and sugar are per-household allowances.
export function entitlementFor(card) {
  if (!card) return { rice: 0, wheat: 0, sugar: 0 }
  const rice = card.scheme === 'AAY' ? 35 : card.members * 5
  return { rice, wheat: 8, sugar: 2 }
}

export const RATES = { rice: 1, wheat: 2, sugar: 13.5 }

export const priceFor = (quantities) =>
  Math.round(
    Object.entries(quantities).reduce((total, [k, qty]) => total + qty * (RATES[k] ?? 0), 0),
  )

export const collectionFor = (cardNumber, cycle = currentCycle()) =>
  db.transactions().find((t) => t.cardNumber === cardNumber && t.cycle === cycle) ?? null

export function entitlementRows(card, cycle = currentCycle()) {
  const due = entitlementFor(card)
  const collected = collectionFor(card.number, cycle)
  return Object.entries(due).map(([key, qty]) => ({
    key,
    item: key[0].toUpperCase() + key.slice(1),
    entitled: qty,
    collected: collected?.quantities?.[key] ?? 0,
    due: collected ? 0 : qty,
    rate: RATES[key],
  }))
}
