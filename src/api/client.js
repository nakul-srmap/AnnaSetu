const BASE = import.meta.env?.VITE_API_URL ?? globalThis.__ANNASETU_API_URL__ ?? '/api'
const STORAGE_KEY = 'annasetu.session'

let authToken = null

// The session survives a page refresh, which any real application needs.
try {
  authToken = globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null
} catch {
  authToken = null
}

export function setAuthToken(token) {
  authToken = token
  try {
    if (token) globalThis.sessionStorage?.setItem(STORAGE_KEY, token)
    else globalThis.sessionStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable — the in-memory token still works for this tab */
  }
}

export const getAuthToken = () => authToken

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0, null)
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(payload?.error ?? `Request failed (${res.status})`, res.status, payload)
  return payload
}

export const api = {
  helplineInfo: () => request('/helpline'),

  lookupCard: (q) => request(`/helpline-desk/lookup?q=${encodeURIComponent(q)}`),
  bookForCaller: (body) => request('/helpline-desk/bookings', { method: 'POST', body }),
  cancelForCaller: (id) => request(`/helpline-desk/bookings/${id}`, { method: 'DELETE' }),
  deskRecent: () => request('/helpline-desk/recent'),

  cardSignIn: (identifier, pin, assisted = false) =>
    request('/auth/card/sign-in', { method: 'POST', body: { identifier, pin, assisted } }),
  cardStatus: (identifier) => request('/auth/card/status', { method: 'POST', body: { identifier } }),
  setCardPin: (number, pin) =>
    request(`/dealer/cards/${encodeURIComponent(number)}/pin`, { method: 'POST', body: { pin } }),
  pinStatus: () => request('/dealer/cards/pin-status'),
  login: (identifier, password) => request('/auth/login', { method: 'POST', body: { identifier, password } }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  beneficiary: (opts) => request('/beneficiary', opts),
  shops: (coords) =>
    request(
      coords
        ? `/beneficiary/shops?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`
        : '/beneficiary/shops',
    ),
  slots: (code) => request(`/beneficiary/shops/${encodeURIComponent(code)}/slots`),
  book: (shop, slot) => request('/beneficiary/bookings', { method: 'POST', body: { shop, slot } }),
  cancelBooking: (id) => request(`/beneficiary/bookings/${id}`, { method: 'DELETE' }),
  fileGrievance: (body) => request('/beneficiary/grievances', { method: 'POST', body }),
  applyForAssistance: (body) => request('/beneficiary/assistance', { method: 'POST', body }),
  requestDelivery: (body) => request('/beneficiary/deliveries', { method: 'POST', body }),

  dealer: (opts) => request('/dealer', opts),
  queue: (opts) => request('/dealer/queue', opts),
  scan: (payload, manual = false) => request('/dealer/scan', { method: 'POST', body: { payload, manual } }),
  readTag: (tag) => request('/dealer/rfid', { method: 'POST', body: { tag } }),
  lookupTag: (tag) => request('/dealer/rfid/lookup', { method: 'POST', body: { tag } }),
  bookAtCounter: (body) => request('/dealer/bookings', { method: 'POST', body }),
  receiveBag: (tag) => request('/dealer/consignments/receive', { method: 'POST', body: { tag } }),
  issue: (bookingId, quantities) => request('/dealer/transactions', { method: 'POST', body: { bookingId, quantities } }),
  raiseIndent: (body) => request('/dealer/indents', { method: 'POST', body }),
  assignDelivery: (id, partner) => request(`/dealer/deliveries/${id}/assign`, { method: 'POST', body: { partner } }),

  masters: () => request('/officer/masters'),
  monitoring: (opts) => request('/officer/monitoring', opts),
  gaps: () => request('/officer/gaps'),
  grievances: () => request('/officer/grievances'),
  setGrievanceStage: (id, body) =>
    request(`/officer/grievances/${encodeURIComponent(id)}/stage`, { method: 'POST', body }),
  indents: () => request('/officer/indents'),
  emergency: () => request('/officer/emergency'),
  declareEmergency: (body) => request('/officer/emergency', { method: 'POST', body }),
  liftEmergency: (district) =>
    request(`/officer/emergency/${encodeURIComponent(district)}`, { method: 'DELETE' }),
  decideIndent: (id, body) =>
    request(`/officer/indents/${encodeURIComponent(id)}/decision`, { method: 'POST', body }),
  assistanceQueue: () => request('/officer/assistance'),
  decideAssistance: (cardNumber, body) =>
    request(`/officer/assistance/${encodeURIComponent(cardNumber)}/decision`, { method: 'POST', body }),
}
