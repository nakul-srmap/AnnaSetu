import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, getAuthToken, setAuthToken } from '../api/client'
import { HOME_VIEW } from '../data/reference'

const SessionContext = createContext(null)

// How often a signed-in portal re-reads its own data. This is what makes a
// booking appear in the dealer's queue without anyone reloading the page.
const POLL_MS = 4000

export function SessionProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [view, setView] = useState('overview')
  const [data, setData] = useState(null)
  const [officer, setOfficer] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [booting, setBooting] = useState(Boolean(getAuthToken()))
  const [lastSync, setLastSync] = useState(null)

  const pollRef = useRef(null)
  const inFlight = useRef(false)

  // Silent refresh: no spinner, no error banner. Used by the poll loop so a
  // brief network blip doesn't flash warnings at someone mid-transaction.
  const load = useCallback(async (role, { quiet = false } = {}) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      if (role === 'beneficiary') setData(await api.beneficiary())
      else if (role === 'dealer') setData(await api.dealer())
      else if (role === 'helpline') setData(await api.deskRecent())
      else if (role === 'officer') {
        const [monitoring, masters, gaps, grievances, assistance, indents] = await Promise.all([
          api.monitoring(), api.masters(), api.gaps(), api.grievances(), api.assistanceQueue(),
          api.indents(),
        ])
        setOfficer({ monitoring, masters, gaps, grievances, assistance, indents })
      }
      setLastSync(new Date())
      if (!quiet) setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null)
        setAccount(null)
        setData(null)
      } else if (!quiet) {
        setError(err.message)
      }
    } finally {
      inFlight.current = false
    }
  }, [])

  // Restore an existing session on load, so a refresh doesn't sign you out.
  useEffect(() => {
    if (!getAuthToken()) return
    let cancelled = false
    ;(async () => {
      try {
        const { account: me } = await api.me()
        if (cancelled) return
        setAccount(me)
        setView(HOME_VIEW[me.role])
        await load(me.role, { quiet: true })
      } catch {
        setAuthToken(null)
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [load])

  // Poll while signed in, and refresh immediately when the tab regains focus —
  // the common case of switching between two browser windows during a handover.
  useEffect(() => {
    if (!account) return undefined

    const tick = () => {
      // Skip only when the tab is genuinely hidden. `document.hidden` is also
      // true for states like 'prerender', which would stall a live portal.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      load(account.role, { quiet: true })
    }
    pollRef.current = setInterval(tick, POLL_MS)
    const onFocus = () => tick()
    globalThis.addEventListener?.('focus', onFocus)
    document?.addEventListener?.('visibilitychange', onFocus)

    return () => {
      clearInterval(pollRef.current)
      globalThis.removeEventListener?.('focus', onFocus)
      document?.removeEventListener?.('visibilitychange', onFocus)
    }
  }, [account, load])

  const act = useCallback(async (fn) => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const actions = useMemo(() => ({
    setView,
    clearError: () => setError(null),

    // Households sign in with the card number and a PIN set at the shop.
    cardSignIn: (identifier, pin, assistedRequested = false) =>
      act(async () => {
        const { token, account: me } = await api.cardSignIn(identifier, pin, assistedRequested)
        setAuthToken(token)
        setAccount(me)
        setView(HOME_VIEW[me.role])
        await load(me.role)
        return me
      }),

    // Staff accounts hold passwords.
    signIn: (identifier, password) =>
      act(async () => {
        const { token, account: me } = await api.login(identifier, password)
        setAuthToken(token)
        setAccount(me)
        setView(HOME_VIEW[me.role])
        await load(me.role)
        return me
      }),

    signOut: () =>
      act(async () => {
        await api.logout().catch(() => {})
        setAuthToken(null)
        setAccount(null)
        setData(null)
        setOfficer({})
      }),

    refresh: () => act(() => load(account?.role)),

    book: (shop, slot) =>
      act(async () => {
        const res = await api.book(shop, slot)
        setData(res)
        setView('token')
        return res.booking
      }),

    cancelBooking: (id) => act(async () => setData(await api.cancelBooking(id))),
    scan: (payload, manual) => act(() => api.scan(payload, manual)),
    setCardPin: (number, pin) => act(() => api.setCardPin(number, pin)),
    readTag: (tag) => act(() => api.readTag(tag)),
    lookupTag: (tag) => act(() => api.lookupTag(tag)),

    bookAtCounter: (body) =>
      act(async () => {
        const r = await api.bookAtCounter(body)
        await load('dealer', { quiet: true })
        return r
      }),

    receiveBag: (tag) =>
      act(async () => {
        const r = await api.receiveBag(tag)
        await load('dealer', { quiet: true })
        return r
      }),

    lookupCard: (q) => act(() => api.lookupCard(q)),
    bookForCaller: (body) => act(() => api.bookForCaller(body)),
    cancelForCaller: (id) => act(() => api.cancelForCaller(id)),

    issue: (bookingId, quantities) =>
      act(async () => {
        const res = await api.issue(bookingId, quantities)
        setData(res)
        return res.receipt
      }),

    raiseIndent: (body) => act(async () => setData(await api.raiseIndent(body))),
    assignDelivery: (id, partner) => act(async () => setData(await api.assignDelivery(id, partner))),
    fileGrievance: (body) => act(async () => setData(await api.fileGrievance(body))),
    requestDelivery: (body) => act(async () => setData(await api.requestDelivery(body))),
    applyForAssistance: (body) => act(async () => setData(await api.applyForAssistance(body))),
    decideAssistance: (cardNumber, body) =>
      act(async () => {
        await api.decideAssistance(cardNumber, body)
        await load('officer', { quiet: true })
      }),

    decideIndent: (id, body) =>
      act(async () => {
        await api.decideIndent(id, body)
        await load('officer', { quiet: true })
      }),

    setGrievanceStage: (id, body) =>
      act(async () => {
        await api.setGrievanceStage(id, body)
        await load('officer', { quiet: true })
      }),
  }), [account, act, load])

  const value = useMemo(
    () => ({ account, role: account?.role ?? null, view, data, officer, error, busy, booting, lastSync, ...actions }),
    [account, view, data, officer, error, busy, booting, lastSync, actions],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
