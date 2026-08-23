import { Router } from 'express'
import { db } from '../db.js'
import { requireRole } from '../auth/middleware.js'
import { currentCycle, today } from '../domain/cycle.js'
import { entitlementFor } from '../domain/entitlement.js'
import { slotAvailability } from '../domain/slots.js'
import { channelBreakdown } from '../domain/booking.js'
import { isVerified } from '../domain/assistance.js'
import { assistanceState, decideAssistance, pendingApplications } from '../domain/assistance.js'
import { REORDER } from '../domain/stock.js'
import { dispatchConsignment } from '../domain/consignment.js'
import { declareEmergency, emergencyFor, guidance, liftEmergency } from '../domain/emergency.js'

const router = Router()
router.use(requireRole('officer'))

// An officer sees their own district. The district comes from their account,
// never from a constant in the code.
const scope = (req) => {
  const district = req.user.district
  const shops = db.shops().filter((s) => !district || s.district === district)
  const codes = new Set(shops.map((s) => s.code))
  const cards = db.cards().filter((c) => codes.has(c.shop))
  const transactions = db.transactions().filter((t) => codes.has(t.shop))
  return { district, shops, codes, cards, transactions }
}

router.get('/masters', (req, res) => {
  const { cards, shops, district } = scope(req)
  res.json({
    district,
    cards: {
      total: cards.length,
      byScheme: cards.reduce((acc, c) => ({ ...acc, [c.scheme]: (acc[c.scheme] ?? 0) + 1 }), {}),
      members: cards.reduce((n, c) => n + c.members, 0),
      withAssistance: cards.filter((c) => isVerified(c)).length,
    },
    shops: shops.map((s) => ({
      code: s.code, name: s.name, dealer: s.dealer,
      mandal: s.mandal, district: s.district, device: s.device,
    })),
  })
})

router.get('/monitoring', (req, res) => {
  const cycle = currentCycle()
  const { cards, shops, transactions, district } = scope(req)
  const cycleTx = transactions.filter((t) => t.cycle === cycle)

  res.json({
    date: today(),
    cycle,
    district,
    transactionsToday: transactions.filter((t) => t.date === today()).length,
    cardsServed: cycleTx.length,
    cardsTotal: cards.length,
    coverage: cards.length ? Math.round((cycleTx.length / cards.length) * 100) : 0,
    grainIssued: cycleTx.reduce(
      (acc, t) => ({
        rice: acc.rice + (t.quantities.rice ?? 0),
        wheat: acc.wheat + (t.quantities.wheat ?? 0),
        sugar: acc.sugar + (t.quantities.sugar ?? 0),
      }),
      { rice: 0, wheat: 0, sugar: 0 },
    ),
    revenue: cycleTx.reduce((n, t) => n + t.payable, 0),
    shops: shops.map((s) => {
      const served = cycleTx.filter((t) => t.shop === s.code).length
      const due = cards.filter((c) => c.shop === s.code).length
      const slots = slotAvailability(s.code)
      return {
        code: s.code,
        name: s.name,
        mandal: s.mandal,
        served,
        due,
        coverage: due ? Math.round((served / due) * 100) : 0,
        booked: slots.reduce((n, sl) => n + sl.booked, 0),
        stock: s.stock,
        opening: s.opening,
      }
    }),
    channels: channelBreakdown(new Set(shops.map((s) => s.code))),
    recent: transactions
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .slice(0, 8)
      .map((t) => ({
        id: t.id,
        shop: t.shop,
        token: t.token,
        card: t.cardNumber,
        payable: t.payable,
        issuedAt: t.issuedAt,
      })),
  })
})

// Every signal below is computed from shops' own records — nothing is authored.
router.get('/gaps', (req, res) => {
  const { shops, cards, transactions } = scope(req)
  const cycleTx = transactions.filter((t) => t.cycle === currentCycle())

  const shortage = []
  for (const shop of shops) {
    const unserved = cards.filter(
      (c) => c.shop === shop.code && !cycleTx.some((t) => t.cardNumber === c.number),
    )
    const demand = unserved.reduce(
      (acc, c) => {
        const due = entitlementFor(c)
        return { rice: acc.rice + due.rice, wheat: acc.wheat + due.wheat, sugar: acc.sugar + due.sugar }
      },
      { rice: 0, wheat: 0, sugar: 0 },
    )
    for (const key of ['rice', 'wheat', 'sugar']) {
      if (demand[key] > (shop.stock[key] ?? 0)) {
        shortage.push({
          title: `${shop.code} — ${key} short of demand`,
          tag: `${shop.stock[key] ?? 0} kg`,
          body: `${unserved.length} card${unserved.length === 1 ? '' : 's'} unserved need ${demand[key]} kg of ${key}; the shop holds ${shop.stock[key] ?? 0} kg.`,
        })
      }
    }
  }

  const diversion = shops
    .map((shop) => {
      const issued = cycleTx
        .filter((t) => t.shop === shop.code)
        .reduce((n, t) => n + Object.values(t.quantities).reduce((a, b) => a + b, 0), 0)
      const openingTotal = Object.values(shop.opening).reduce((a, b) => a + b, 0)
      const onHand = Object.values(shop.stock).reduce((a, b) => a + b, 0)
      const unaccounted = openingTotal - onHand - issued
      const pct = openingTotal ? Math.round((unaccounted / openingTotal) * 100) : 0
      return unaccounted > 0
        ? {
            title: `${shop.code} — received minus issued does not reconcile`,
            tag: `${pct}%`,
            body: `${unaccounted} kg between the opening receipt and what the device has issued or still holds.`,
          }
        : null
    })
    .filter(Boolean)

  const codes = new Set(shops.map((s) => s.code))
  const exceptions = db.scanExceptions().filter((e) => codes.has(e.shop))
  const byShop = exceptions.reduce((acc, e) => ({ ...acc, [e.shop]: (acc[e.shop] ?? 0) + 1 }), {})
  const anomaly = Object.entries(byShop).map(([shop, count]) => ({
    title: `${shop} — ${count} manual token entr${count === 1 ? 'y' : 'ies'}`,
    tag: 'exception',
    body: 'Tokens keyed in by hand rather than scanned. Repeated use is worth an inspection.',
  }))

  res.json({ shortage, diversion, anomaly })
})

// Assistance verification: the control that decides who may use home delivery.
router.get('/assistance', (req, res) => {
  const { codes, cards } = scope(req)
  res.json({
    pending: pendingApplications(codes),
    verified: cards
      .filter((c) => assistanceState(c).status === 'verified')
      .map((c) => ({
        cardNumber: c.number,
        holder: c.holder,
        shop: c.shop,
        assistance: assistanceState(c),
      })),
    expired: cards
      .filter((c) => assistanceState(c).status === 'expired')
      .map((c) => ({ cardNumber: c.number, holder: c.holder, shop: c.shop, assistance: c.assistance })),
  })
})

router.post('/assistance/:cardNumber/decision', (req, res) => {
  const { codes } = scope(req)
  const card = db.card(req.params.cardNumber)
  if (!card || !codes.has(card.shop)) {
    return res.status(404).json({ error: 'That card is not in your district.' })
  }

  const { approve = false, reason, months } = req.body ?? {}
  const result = decideAssistance({
    cardNumber: card.number,
    approve: Boolean(approve),
    officerId: req.user.id,
    reason,
    months,
  })
  if (result.error) return res.status(409).json({ error: result.error })
  res.json({ ok: true, assistance: assistanceState(db.card(card.number)) })
})

// A shop raising an indent is asking the district for stock. It was being
// written by the dealer and read by nobody, so the request died at the shop.
// Declaring a public health restriction across the district.
router.get('/emergency', (req, res) => {
  const { district } = scope(req)
  const active = emergencyFor(district)
  res.json({
    district,
    emergency: active,
    guidance: active ? guidance(active.phase) : null,
  })
})

router.post('/emergency', (req, res) => {
  const { district: own } = scope(req)
  const district = req.body?.district ?? own
  const reason = req.body?.reason
  if (own && district !== own) {
    return res.status(403).json({ error: 'That district is not in your charge.' })
  }
  if (emergencyFor(district)) {
    return res.status(409).json({ error: `${district} is already under a declared restriction.` })
  }
  const row = db.write((state) => declareEmergency(state, { district, reason, declaredBy: req.user.name }))
  res.status(201).json({ emergency: emergencyFor(row.district) })
})

router.delete('/emergency/:district', (req, res) => {
  const { district: own } = scope(req)
  const district = req.params.district
  if (own && district !== own) {
    return res.status(403).json({ error: 'That district is not in your charge.' })
  }
  const row = db.write((state) => liftEmergency(state, district))
  if (!row) return res.status(404).json({ error: `${district} is not under a declared restriction.` })
  res.json({ ok: true, liftedOn: row.liftedOn })
})

router.get('/indents', (req, res) => {
  const { codes, shops } = scope(req)
  const rows = db
    .indents()
    .filter((i) => codes.has(i.shop))
    .map((i) => ({
      ...i,
      shopName: shops.find((s) => s.code === i.shop)?.name ?? i.shop,
      onHand: shops.find((s) => s.code === i.shop)?.stock?.[i.commodity] ?? null,
      reorder: REORDER[i.commodity] ?? null,
    }))
    .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
  res.json({
    indents: rows,
    stats: {
      pending: rows.filter((i) => i.status === 'pending').length,
      approved: rows.filter((i) => i.status === 'approved').length,
      total: rows.length,
    },
  })
})

router.post('/indents/:id/decision', (req, res) => {
  const { codes } = scope(req)
  const { decision, quantity = null, note = '' } = req.body ?? {}
  if (!['approved', 'declined'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or declined.' })
  }
  const indent = db.indents().find((i) => i.id === req.params.id)
  if (!indent || !codes.has(indent.shop)) {
    return res.status(404).json({ error: 'No such indent in this district.' })
  }
  if (indent.status !== 'pending') {
    return res.status(409).json({ error: 'That indent has already been decided.' })
  }

  const dispatched = db.write((state) => {
    const row = state.indents.find((i) => i.id === indent.id)
    row.status = decision
    // An officer may sanction less than was asked for; that is the whole point
    // of the approval, so the sanctioned figure is recorded separately.
    row.sanctioned = decision === 'approved' ? Number(quantity ?? row.quantity) : 0
    row.note = note
    row.decidedBy = req.user.name
    row.decidedAt = new Date().toISOString()

    // Sanctioning it is what puts it on a truck: the godown makes up the load
    // and tags every bag before it leaves.
    return decision === 'approved' ? dispatchConsignment(state, row) : []
  })

  res.json({
    ok: true,
    dispatched: dispatched.length,
    bags: dispatched.map((b) => ({ tag: b.tag, weightKg: b.weightKg })),
  })
})

router.get('/grievances', (req, res) => {  const { codes } = scope(req)
  const tickets = db
    .grievances()
    .filter((g) => codes.has(g.shop))
    .map((g) => ({ ...g, hasReceipt: Boolean(g.transactionId) }))
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt))
  res.json({
    tickets,
    stats: {
      open: tickets.filter((t) => t.open).length,
      total: tickets.length,
      withReceipt: tickets.filter((t) => t.transactionId).length,
    },
  })
})

router.post('/grievances/:id/stage', (req, res) => {
  const { stage = 'inspection assigned', close = false } = req.body ?? {}
  const ticket = db.grievances().find((g) => g.id === req.params.id)
  if (!ticket) return res.status(404).json({ error: 'No such grievance.' })
  db.write((state) => {
    const row = state.grievances.find((g) => g.id === ticket.id)
    row.stage = stage
    row.open = !close
  })
  res.json({ ok: true })
})

export default router
