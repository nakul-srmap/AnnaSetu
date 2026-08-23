import { readSession } from './tokens.js'
import { db } from '../db.js'
import { emergencyForShop } from '../domain/emergency.js'
import { assistanceState, isVerified } from '../domain/assistance.js'

export function authenticate(req, _res, next) {
  const [scheme, raw] = (req.headers.authorization ?? '').split(' ')
  req.user = null
  if (scheme === 'Bearer' && raw) {
    const claims = readSession(raw)
    if (claims) req.user = db.users().find((u) => u.id === claims.sub) ?? null
  }
  next()
}

export const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' })

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' })
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'This account does not have access to that.' })
  }
  next()
}

// Home delivery is restricted to cards with a senior or disabled member.
// Enforced here so hiding the menu item is presentation, not the control.
export function requireAssistance(req, res, next) {
  const card = db.cards().find((c) => c.number === req.user?.cardNumber)

  // While a district is under lockdown, home delivery is open to every
  // household. Requiring a household to prove frailty during a gathering ban
  // would send exactly the people who should stay home out to prove it.
  const emergency = emergencyForShop(card?.shop)
  if (emergency?.deliveryOpenToAll) {
    req.card = card
    return next()
  }

  if (!isVerified(card)) {
    const state = assistanceState(card)
    const messages = {
      none: 'Home delivery requires a verified assistance status. Apply from the delivery section.',
      pending: 'Your assistance application is still under review.',
      rejected: `Your assistance application was not approved. ${card?.assistance?.reason ?? ''}`.trim(),
      expired: 'Your assistance verification has lapsed and needs renewing.',
    }
    return res.status(403).json({
      error: messages[state.status] ?? messages.none,
      assistanceStatus: state.status,
    })
  }
  req.card = card
  next()
}
