// Dates are local to where the shops are, not to the server. On UTC a booking
// made before 05:30 IST would be filed under the previous day, splitting the
// queue and restarting token numbers in the middle of the night.
const ZONE = process.env.TZ_NAME ?? 'Asia/Kolkata'

const localDate = (at = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)

// A distribution cycle is a calendar month: entitlement resets on the 1st.
export const currentCycle = (at = new Date()) => localDate(at).slice(0, 7)

export const today = (at = new Date()) => localDate(at)

// Dates a shop will take a booking for: today and the next six days. A slot
// cannot be booked into the next distribution cycle, since entitlement resets.
export const BOOKING_HORIZON_DAYS = 7

export function bookableDates(from = new Date()) {
  return Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    return localDate(d)
  }).filter((d) => d.slice(0, 7) === currentCycle(from))
}

export const formatDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
