import { useEffect, useState } from 'react'
import useGeolocation from '../../hooks/useGeolocation'
import { api } from '../../api/client'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stepper from '../../components/ui/Stepper'
import Button from '../../components/ui/Button'
import ListRow from '../../components/ui/ListRow'
import Note from '../../components/ui/Note'

const STEPS = ['Choose a shop', 'Pick a slot', 'Confirm']

export default function BookSlot() {
  const { data, book, busy, setView } = useSession()
  const [step, setStep] = useState(0)
  const [shops, setShops] = useState(null)
  const [area, setArea] = useState(null)
  const [shop, setShop] = useState(null)
  const [slots, setSlots] = useState(null)
  const [slot, setSlot] = useState(null)

  // The position is asked for on arrival, so shops are ranked by where the
  // household actually is rather than by the district printed on the card.
  // Refusing the prompt falls back to that district, so the screen still works.
  const { coords, status: geoStatus, message: geoMessage, request: findMe } =
    useGeolocation({ auto: true })

  useEffect(() => {
    let alive = true
    api
      .shops(coords)
      .then((r) => {
        if (!alive) return
        setShops(r.shops)
        setArea(r.area)
      })
      .catch(() => alive && setShops([]))
    return () => { alive = false }
  }, [coords])

  // Availability is re-read while the slot list is open, so two people booking
  // at the same time see each other's effect rather than colliding on submit.
  useEffect(() => {
    if (!shop) return undefined
    let alive = true
    const pull = () => api.slots(shop.code).then((r) => alive && setSlots(r.slots)).catch(() => {})
    pull()
    const id = setInterval(pull, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [shop])

  if (!data) return null

  if (data.collected) {
    return (
      <>
        <PageHeader title="Book a collection slot" lede="This cycle’s ration is already collected." />
        <Panel>
          <p className="text-sm">Booking reopens at the start of the next cycle.</p>
          <Button variant="outline" className="mt-3" onClick={() => setView('entitlement')}>
            View this cycle’s receipt
          </Button>
        </Panel>
      </>
    )
  }

  if (data.booking) {
    return (
      <>
        <PageHeader title="Book a collection slot" lede="You already hold a token for today." />
        <Panel title={`Token ${data.booking.token}`} eyebrow="Active booking">
          <p className="text-sm">
            {data.booking.slot} at {data.booking.shop}. Cancel it from your token screen if you need
            a different time.
          </p>
          <Button className="mt-3" onClick={() => setView('token')}>Go to my token</Button>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={
          area
            ? `${area.mandal ?? ''}${area.mandal ? ', ' : ''}${area.district ?? ''} district${
                area.source === 'position' ? ' · from your location' : ''
              }`
            : 'Collection slots'
        }
        title="Book a collection slot"
        lede="Each slot holds a fixed number of cards, so the shop is never crowded and you are not waiting outside."
        action={
          geoStatus !== 'granted' && (
            <Button variant="outline" size="sm" onClick={findMe} disabled={geoStatus === 'locating'}>
              {geoStatus === 'locating' ? 'Finding you…' : 'Use my location'}
            </Button>
          )
        }
      />
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <Panel
          title="Fair price shops"
          eyebrow={
            coords
              ? 'Nearest first, from your current position'
              : geoStatus === 'locating'
                ? 'Finding your location…'
                : 'Your linked shop first · share a location to sort by distance'
          }
        >
          {shops === null && <p className="text-sm text-ink-soft">Loading shops…</p>}
          {geoMessage && (
            <p className="mb-3 border-l-2 border-ink-rule pl-3 text-xs text-ink-soft">
              {geoMessage} Showing shops for the district on your card instead.
            </p>
          )}
          {shops?.map((s) => (
            <ListRow
              key={s.code}
              title={`${s.code} — ${s.name}${s.linked ? ' · your linked shop' : ''}`}
              detail={[
                s.distanceKm !== null ? `${s.distanceKm} km away` : s.mandal,
                s.address,
                `${s.inStock.join(', ') || 'no stock'} in stock`,
              ]
                .filter(Boolean)
                .join(' · ')}
              meta={s.openSlots > 0 ? `${s.waiting} booked` : 'full today'}
              disabled={s.openSlots === 0}
              onClick={s.openSlots === 0 ? undefined : () => { setShop(s); setStep(1) }}
            />
          ))}
          <Note>
            Collecting at a shop other than your linked one is a portable transaction. It is allowed,
            and the district sees it so stock can follow demand. Anyone without a smartphone can book
            the same slots by calling the helpline.
          </Note>
        </Panel>
      )}

      {step === 1 && shop && (
        <Panel
          title={`${shop.code} — today`}
          eyebrow="Availability refreshes automatically"
          action={
            <Button variant="ghost" size="sm" onClick={() => { setShop(null); setSlots(null); setStep(0) }}>
              ← Change shop
            </Button>
          }
        >
          {slots === null && <p className="text-sm text-ink-soft">Checking availability…</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {slots?.map((s) => (
              <ListRow
                key={s.time}
                title={s.time}
                detail={`${s.booked} of ${s.capacity} booked`}
                meta={s.left === 0 ? 'full' : `${s.left} left`}
                disabled={s.left === 0}
                onClick={s.left === 0 ? undefined : () => { setSlot(s); setStep(2) }}
              />
            ))}
          </div>
        </Panel>
      )}

      {step === 2 && shop && slot && (
        <Panel title="Confirm your booking" eyebrow="No charge for a slot">
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ['Shop', `${shop.code} — ${shop.name}`],
              ['Slot', slot.time],
              ['Collecting', data.entitlement.map((e) => `${e.due} kg ${e.item.toLowerCase()}`).join(' · ')],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-1 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="lg" disabled={busy} onClick={() => book(shop.code, slot.time)}>
              {busy ? 'Booking…' : 'Confirm booking'}
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)}>← Pick another slot</Button>
          </div>
          <Note>
            Arrive within your slot. If you miss it the token is released and you can book again the
            same day, subject to availability.
          </Note>
        </Panel>
      )}
    </>
  )
}
