import { Router } from 'express'
import { db } from '../db.js'
import { config } from '../config.js'
import { verifyPassword } from '../auth/passwords.js'
import { signSession } from '../auth/tokens.js'
import { requireAuth } from '../auth/middleware.js'
import { assistanceState, isVerified } from '../domain/assistance.js'
import { hasPin, verifyPin } from '../domain/pin.js'

const router = Router()

// People write identifiers inconsistently: a mobile with or without a space,
// a licence with or without slashes.
const normalise = (v) => String(v ?? '').toLowerCase().replace(/[\s/-]/g, '')

// Households sign in with the number printed on the ration card. Staff sign in
// with their licence or officer ID. The one-time code always goes to the mobile
// registered against the card, whichever way the household identified itself.
const findUser = (identifier) => {
  const key = normalise(identifier)
  if (!key) return null

  const byIdentifier = db.users().find((u) => normalise(u.identifier) === key)
  if (byIdentifier) return byIdentifier

  const card = db
    .cards()
    .find((c) => normalise(c.number) === key || normalise(c.mobile) === key)
  if (card) return db.users().find((u) => u.cardNumber === card.number) ?? null

  return null
}

// The code is delivered to the mobile on the card, shown masked so the caller
// knows which number to check without the digits being exposed.
const maskMobile = (mobile) => {
  const digits = String(mobile ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `••••• ${digits.slice(-4)}` : null
}

export function publicUser(user) {
  const account = {
    id: user.id,
    identifier: user.identifier,
    role: user.role,
    name: user.name,
    cardNumber: user.cardNumber,
    shopCode: user.shopCode,
    district: user.district,
  }
  if (user.role === 'beneficiary') {
    const card = db.card(user.cardNumber)
    account.assistance = isVerified(card)
    account.assistanceStatus = assistanceState(card).status
    account.district = card?.district ?? null
    account.mandal = card?.mandal ?? null
  }
  if (user.role === 'dealer') {
    const shop = db.shop(user.shopCode)
    account.district = shop?.district ?? null
    account.mandal = shop?.mandal ?? null
  }
  return account
}

const session = (user) => ({ token: signSession(user), account: publicUser(user) })

// Households sign in with their card number and a PIN set at the shop counter.
//
// This replaced a one-time code sent by SMS. The system now makes no outbound
// network request of any kind, so there is no gateway to pay for, no quota to
// exhaust, and nothing that stops working when a message fails to deliver.
router.post('/card/sign-in', (req, res) => {
  const { identifier, pin, assisted = false } = req.body ?? {}
  const user = findUser(identifier)

  // Answer the same way for an unknown card as for a wrong PIN, so this cannot
  // be used to discover which card numbers are registered.
  if (!user || user.role !== 'beneficiary') {
    return res.status(401).json({ error: 'Those details were not recognised.' })
  }

  const result = verifyPin(user.identifier, pin)
  if (result.error) {
    return res.status(result.needsPin ? 409 : 401).json({
      error: result.error,
      ...(result.needsPin ? { needsPin: true } : {}),
    })
  }

  // Assisted sign-in is only granted to cards with a senior or disabled member
  // recorded. Asking for it does not confer it.
  if (assisted && !isVerified(db.card(user.cardNumber))) {
    return res.status(403).json({
      error:
        'This card has no verified assistance status, so assisted sign-in is not available. Use standard sign-in and apply from the delivery section.',
    })
  }

  res.json(session(user))
})

// Whether a card has a PIN yet, so the sign-in screen can tell someone to visit
// the shop rather than letting them guess at a credential that does not exist.
router.post('/card/status', (req, res) => {
  const user = findUser(req.body?.identifier)
  const known = Boolean(user && user.role === 'beneficiary')
  res.json({ hasPin: known ? hasPin(user.identifier) : true })
})

// Dealers and officers hold accounts with passwords.
router.post('/login', (req, res) => {
  const { identifier, password } = req.body ?? {}
  const user = findUser(identifier)

  if (!user || user.role === 'beneficiary' || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Those credentials were not recognised.' })
  }
  res.json(session(user))
})

router.get('/me', requireAuth, (req, res) => res.json({ account: publicUser(req.user) }))

router.post('/logout', (_req, res) => res.json({ ok: true }))

export default router
