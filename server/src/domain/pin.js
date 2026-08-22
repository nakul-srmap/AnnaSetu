import { hashPassword, verifyPassword } from '../auth/passwords.js'
import { db } from '../db.js'

// How a household proves who they are, without sending anything anywhere.
//
// A PIN is set at the shop counter, where the dealer confirms the person in
// front of them — the same in-person check that issues a ration card in the
// first place. That removes the only metered dependency in the system: no SMS
// gateway, no outbound request, nothing to run out of.
//
// The security argument for this being enough: booking a slot is not the
// authorisation boundary. Collection is. A booking made by the wrong person
// still cannot be collected, because the dealer confirms the cardholder at the
// counter before anything leaves the shop. The worst a leaked PIN buys is a
// nuisance booking, which is also why one open token per card matters.

export const PIN_LENGTH = 4
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 10 * 60 * 1000

export const isValidPin = (pin) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(String(pin ?? ''))

// Trivially guessable PINs are refused at the point of setting, not silently
// accepted and blamed on the household later.
const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2580'])
export const isWeakPin = (pin) => WEAK.has(String(pin))

export function setPin(cardNumber, pin) {
  if (!isValidPin(pin)) return { error: `The PIN must be ${PIN_LENGTH} digits.` }
  if (isWeakPin(pin)) return { error: 'That PIN is too easy to guess. Choose another.' }

  const user = db.users().find((u) => u.identifier === cardNumber && u.role === 'beneficiary')
  if (!user) return { error: 'Unknown ration card.' }

  db.write((state) => {
    const row = state.users.find((u) => u.id === user.id)
    row.passwordHash = hashPassword(String(pin))
    row.pinSetAt = new Date().toISOString()
    row.failedAttempts = 0
    row.lockedUntil = null
  })
  return { ok: true }
}

export const hasPin = (cardNumber) =>
  Boolean(db.users().find((u) => u.identifier === cardNumber && u.role === 'beneficiary')?.passwordHash)

// Attempts are counted and briefly locked out, because a four-digit PIN with
// unlimited guesses is not a credential.
export function verifyPin(cardNumber, pin) {
  const user = db.users().find((u) => u.identifier === cardNumber && u.role === 'beneficiary')
  if (!user) return { error: 'Those details were not recognised.' }

  if (!user.passwordHash) {
    return { error: 'No PIN has been set for this card yet. Ask your fair price shop to set one.', needsPin: true }
  }

  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    const mins = Math.ceil((Date.parse(user.lockedUntil) - Date.now()) / 60000)
    return { error: `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask the shop to reset it.` }
  }

  if (!verifyPassword(String(pin), user.passwordHash)) {
    const left = db.write((state) => {
      const row = state.users.find((u) => u.id === user.id)
      row.failedAttempts = (row.failedAttempts ?? 0) + 1
      if (row.failedAttempts >= MAX_ATTEMPTS) {
        row.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString()
        row.failedAttempts = 0
        return 0
      }
      return MAX_ATTEMPTS - row.failedAttempts
    })
    return {
      error: left > 0
        ? `That PIN is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many wrong attempts. Ask the shop to reset your PIN.',
    }
  }

  db.write((state) => {
    const row = state.users.find((u) => u.id === user.id)
    row.failedAttempts = 0
    row.lockedUntil = null
  })
  return { user }
}
