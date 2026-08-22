import { db } from './../db.js'

// Home delivery is a rationed service, so eligibility is a verified status with
// an expiry — not a permanent property of a card. States:
//   none      — never applied
//   pending   — applied, awaiting an officer's decision
//   verified  — approved, and within its review date
//   rejected  — refused, with a reason the household can read
//   expired   — was verified, past its review date
export const STATUS = {
  none: 'none',
  pending: 'pending',
  verified: 'verified',
  rejected: 'rejected',
  expired: 'expired',
}

export const GROUNDS = [
  { id: 'senior', label: 'A member aged 60 or above', document: 'Aadhaar or age proof' },
  { id: 'disability', label: 'A member with a disability certificate', document: 'UDID or disability certificate' },
  { id: 'medical', label: 'Temporary medical exemption', document: 'Doctor’s certificate' },
  { id: 'sole', label: 'Sole member living alone and unable to travel', document: 'Self-declaration, verified locally' },
]

const today = () => new Date().toISOString().slice(0, 10)

// A verification that has passed its review date stops being valid on its own,
// without anyone running a job.
export function assistanceState(card) {
  const a = card?.assistance
  if (!a || !a.status || a.status === STATUS.none) return { status: STATUS.none }
  if (a.status === STATUS.verified && a.expiresOn && a.expiresOn < today()) {
    return { ...a, status: STATUS.expired }
  }
  return a
}

export const isVerified = (card) => assistanceState(card).status === STATUS.verified

export function applyForAssistance({ cardNumber, ground, memberName, documentRef, note }) {
  const card = db.card(cardNumber)
  if (!card) return { error: 'Unknown ration card.' }

  const current = assistanceState(card)
  if (current.status === STATUS.pending) {
    return { error: 'An application is already under review for this card.' }
  }
  if (current.status === STATUS.verified) {
    return { error: 'Home delivery is already verified for this card.' }
  }
  if (!GROUNDS.some((g) => g.id === ground)) {
    return { error: 'Choose one of the listed grounds for assistance.' }
  }
  if (!String(memberName ?? '').trim()) {
    return { error: 'Name the member the assistance is for.' }
  }

  db.write((state) => {
    const row = state.cards.find((c) => c.number === cardNumber)
    row.assistance = {
      status: STATUS.pending,
      ground,
      member: String(memberName).trim(),
      documentRef: String(documentRef ?? '').trim() || null,
      note: String(note ?? '').trim() || null,
      requestedAt: new Date().toISOString(),
    }
  })
  return { ok: true }
}

export function decideAssistance({ cardNumber, approve, officerId, reason, months = 12 }) {
  const card = db.card(cardNumber)
  if (!card) return { error: 'Unknown ration card.' }
  if (assistanceState(card).status !== STATUS.pending) {
    return { error: 'There is no application awaiting a decision on this card.' }
  }
  if (!approve && !String(reason ?? '').trim()) {
    return { error: 'A refusal must carry a reason the household can read.' }
  }

  const expiry = new Date()
  expiry.setMonth(expiry.getMonth() + months)

  db.write((state) => {
    const row = state.cards.find((c) => c.number === cardNumber)
    row.assistance = {
      ...row.assistance,
      status: approve ? STATUS.verified : STATUS.rejected,
      decidedAt: new Date().toISOString(),
      decidedBy: officerId,
      reason: String(reason ?? '').trim() || null,
      expiresOn: approve ? expiry.toISOString().slice(0, 10) : null,
    }
  })
  return { ok: true }
}

export const pendingApplications = (shopCodes = null) =>
  db
    .cards()
    .filter((c) => (!shopCodes || shopCodes.has(c.shop)) && assistanceState(c).status === STATUS.pending)
    .map((c) => ({
      cardNumber: c.number,
      holder: c.holder,
      shop: c.shop,
      mandal: c.mandal,
      members: c.members,
      assistance: c.assistance,
    }))
