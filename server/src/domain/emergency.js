import { db } from '../db.js'
import { today } from './cycle.js'

// Operating under a public health restriction.
//
// A ration shop is a place people are legally required to visit, so a
// gathering ban does not suspend the entitlement — it has to be delivered
// differently. This models that as a declared emergency with two phases,
// because the right answer changes as restrictions ease:
//
//   Phase 1, lockdown — nobody should travel. Home delivery is open to every
//   household, not only the elderly and disabled, and slot capacity is cut so
//   the few who must attend are never in a crowd.
//
//   Phase 2, easing — delivery returns to the households that need it most,
//   attendance resumes at reduced density, and every household is shown how to
//   collect without contact.
//
// The phase is derived from the declaration date rather than switched by hand,
// so nobody has to remember to move it on.

export const PHASES = {
  lockdown: 'lockdown',
  easing: 'easing',
  normal: 'normal',
}

// How long universal delivery lasts before restrictions are assumed to ease.
export const LOCKDOWN_DAYS = Number(process.env.LOCKDOWN_DAYS ?? 30)
export const EMERGENCY_DAYS = Number(process.env.EMERGENCY_DAYS ?? 90)

const daysBetween = (fromIso, toIso) =>
  Math.floor((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000)

// The declaration in force for a district, if any.
export function emergencyFor(district, on = today()) {
  const row = db
    .emergencies()
    .filter((e) => e.district === district && e.declaredOn <= on)
    .sort((a, b) => b.declaredOn.localeCompare(a.declaredOn))[0]
  if (!row || row.liftedOn) return null

  const day = daysBetween(row.declaredOn, on)
  if (day >= EMERGENCY_DAYS) return null

  return {
    ...row,
    day: day + 1,
    phase: day < LOCKDOWN_DAYS ? PHASES.lockdown : PHASES.easing,
    daysRemaining: EMERGENCY_DAYS - day,
    // Under lockdown every household may request delivery; as restrictions
    // ease it returns to the verified assistance rules.
    deliveryOpenToAll: day < LOCKDOWN_DAYS,
    slotCapacity: day < LOCKDOWN_DAYS ? 3 : 5,
  }
}

export const emergencyForShop = (shopCode, on = today()) => {
  const shop = db.shop(shopCode)
  return shop ? emergencyFor(shop.district, on) : null
}

// Shown to the household on their own screen. Written as instructions a person
// can actually follow, not as policy language.
export function guidance(phase) {
  if (phase === PHASES.lockdown) {
    return {
      headline: 'Stay home — your ration can come to you',
      points: [
        'Home delivery is open to every household while restrictions are in force. You do not need to prove anything to request it.',
        'If you must collect in person, you must hold a booked slot. Shops cannot serve anyone without one.',
        'Fewer households are booked into each slot, so you should not have to wait near anyone.',
        'Send one person only. Do not bring children.',
        'No phone? Call the helpline on 1967 and they will book it or arrange delivery for you.',
      ],
    }
  }
  if (phase === PHASES.easing) {
    return {
      headline: 'Collecting safely as restrictions ease',
      points: [
        'Arrive within your booked slot, not before. Arriving early creates the queue the slot exists to prevent.',
        'Hold your card to the reader yourself — the shopkeeper does not need to touch it.',
        'Show your token on your phone screen rather than handing over paper.',
        'Keep two metres from others while you wait, and wear a mask inside the shop.',
        'Feeling unwell? Do not attend. Request home delivery instead, or call 1967.',
      ],
    }
  }
  return null
}

export function declareEmergency(state, { district, reason, declaredBy }) {
  const row = {
    id: `EM-${state.emergencies.length + 4401}`,
    district,
    reason: reason || 'Public health restriction',
    declaredBy,
    declaredOn: today(),
    liftedOn: null,
  }
  state.emergencies.push(row)
  return row
}

export function liftEmergency(state, district) {
  const row = state.emergencies.find((e) => e.district === district && !e.liftedOn)
  if (!row) return null
  row.liftedOn = today()
  return row
}
