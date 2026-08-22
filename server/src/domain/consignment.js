import { db } from '../db.js'
import { today } from './cycle.js'

// Stock arriving from the district godown.
//
// A sanctioned indent is dispatched as physical bags, each carrying an RFID
// tag. The dealer taps each bag as it comes off the truck: the weight is added
// to the shop's stock and the bag is struck off the manifest. Nobody keys in a
// quantity, so what the shop records received is what the warehouse recorded
// dispatched — the gap between those two numbers is where diversion hides.
//
// Bag tags are EPC Gen2 class identifiers: 24 hex characters, which is what a
// real UHF pallet tag carries and is why they cannot be confused with the
// 8-character card UIDs read at the counter.

export const BAG_SIZE_KG = 50

export function parseBagTag(input) {
  const raw = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/^(EPC|BAG):/, '')
    .replace(/[\s:-]/g, '')
  return /^[0-9A-F]{24}$/.test(raw) ? raw : null
}

// Deterministic from the indent and the bag's position in the load, so a
// manifest can be reprinted without reissuing physical tags.
function bagTag(indentId, n) {
  let h = 0x811c9dc5
  for (const ch of `${indentId}#${n}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const a = h.toString(16).toUpperCase().padStart(8, '0')
  // Coerced back to unsigned: a bare XOR can go negative, and the minus sign
  // would be stripped by the reader's own cleanup, leaving a short tag.
  const b = ((h ^ 0x5bf03635) >>> 0).toString(16).toUpperCase().padStart(8, '0')
  const c = String(n).padStart(4, '0') + a.slice(0, 4)
  return (a + b + c).slice(0, 24)
}

// Called when an officer sanctions an indent: the godown makes up the load and
// each bag gets a tag before it leaves.
export function dispatchConsignment(state, indent) {
  const kg = Number(indent.sanctioned ?? indent.quantity ?? 0)
  if (kg <= 0) return []

  const bags = []
  const count = Math.ceil(kg / BAG_SIZE_KG)
  let remaining = kg
  for (let n = 1; n <= count; n += 1) {
    const weight = Math.min(BAG_SIZE_KG, remaining)
    remaining -= weight
    bags.push({
      tag: bagTag(indent.id, n),
      indentId: indent.id,
      shop: indent.shop,
      commodity: indent.commodity,
      weightKg: weight,
      status: 'in transit',
      dispatchedAt: new Date().toISOString(),
      receivedAt: null,
    })
  }
  state.consignments.push(...bags)
  return bags
}

export const bagsFor = (shopCode) => db.consignments().filter((b) => b.shop === shopCode)

// What the shop is still waiting on, grouped by the load it belongs to.
export function manifestFor(shopCode) {
  const bags = bagsFor(shopCode)
  const byIndent = new Map()
  for (const bag of bags) {
    const row = byIndent.get(bag.indentId) ?? {
      indentId: bag.indentId,
      commodity: bag.commodity,
      bags: 0,
      received: 0,
      expectedKg: 0,
      receivedKg: 0,
      dispatchedAt: bag.dispatchedAt,
    }
    row.bags += 1
    row.expectedKg += bag.weightKg
    if (bag.status === 'received') {
      row.received += 1
      row.receivedKg += bag.weightKg
    }
    byIndent.set(bag.indentId, row)
  }
  return [...byIndent.values()]
    .map((r) => ({ ...r, complete: r.received === r.bags }))
    .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
}

// Tapping one bag at the shop door.
export function receiveBag({ tag, shopCode, dealerName }) {
  const uid = parseBagTag(tag)
  if (!uid) return { error: 'That is not a consignment tag. Scan the bag again.' }

  const bag = db.consignments().find((b) => b.tag === uid)
  if (!bag) return { error: `Tag ${uid} is not on any manifest for this district.` }
  if (bag.shop !== shopCode) {
    return { error: `That bag was dispatched to ${bag.shop}, not ${shopCode}.` }
  }
  if (bag.status === 'received') {
    return { error: `That bag was already received at ${bag.receivedAt?.slice(11, 16) ?? 'an earlier time'}.` }
  }

  const result = db.write((state) => {
    const row = state.consignments.find((b) => b.tag === uid)
    row.status = 'received'
    row.receivedAt = new Date().toISOString()
    row.receivedBy = dealerName ?? null

    // The weight on the tag goes straight onto the shelf figure.
    const shop = state.shops.find((s) => s.code === shopCode)
    shop.stock[row.commodity] = (shop.stock[row.commodity] ?? 0) + row.weightKg

    // Once the last bag of a load is in, the indent is closed out.
    const siblings = state.consignments.filter((b) => b.indentId === row.indentId)
    const outstanding = siblings.filter((b) => b.status !== 'received').length
    const indent = state.indents.find((i) => i.id === row.indentId)
    if (indent && outstanding === 0) {
      indent.status = 'received'
      indent.receivedAt = new Date().toISOString()
    }

    return { bag: row, outstanding, onHand: shop.stock[row.commodity] }
  })

  return { ...result, received: true }
}

// Bags dispatched but never tapped. A load that never arrived is the signal
// worth surfacing to the district, so it is counted from the same records.
export function undelivered(shopCodes, days = 3) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const iso = cutoff.toISOString()
  return db
    .consignments()
    .filter((b) => shopCodes.has(b.shop) && b.status !== 'received' && b.dispatchedAt < iso)
}

export const todayReceipts = (shopCode) =>
  bagsFor(shopCode).filter((b) => b.status === 'received' && b.receivedAt?.slice(0, 10) === today())
