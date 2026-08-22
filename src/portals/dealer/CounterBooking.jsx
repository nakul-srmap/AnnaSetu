import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Button from '../../components/ui/Button'
import Note from '../../components/ui/Note'
import Pill from '../../components/ui/Pill'
import RfidReader from '../../components/RfidReader'

const dayLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  const today = new Date().toISOString().slice(0, 10)
  if (iso === today) return 'Today'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Booking for a household that has no smartphone.
//
// They come to the shop, tap their ration card, and the dealer books a slot for
// them — today if there is room, otherwise a later day. It is the same booking
// the app makes, so a household that walks in is not a second-class beneficiary.
export default function CounterBooking() {
  const { data, lookupTag, bookAtCounter, busy, error } = useSession()
  const [found, setFound] = useState(null)
  const [day, setDay] = useState(null)
  const [done, setDone] = useState(null)

  if (!data) return null

  const onTap = async (tag) => {
    setDone(null)
    const result = await lookupTag(tag)
    if (!result) return
    setFound(result)
    setDay(result.days?.[0]?.date ?? null)
  }

  const book = async (slot) => {
    const r = await bookAtCounter({ cardNumber: found.card.number, slot, date: day })
    if (!r) return
    setDone(r.booking)
    setFound(null)
  }

  const chosen = found?.days?.find((d) => d.date === day)

  return (
    <>
      <PageHeader
        eyebrow={`${data.shop.code} · ${data.date}`}
        title="Book a slot at the counter"
        lede="For a household without a smartphone. Tap their ration card and book the slot for them."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {!found && (
            <Panel title="Tap the ration card" eyebrow="RFID reader at the counter">
              <RfidReader onRead={onTap} busy={busy} />
              {error && <p className="mt-2 text-xs text-brand-stamp">{error}</p>}
            </Panel>
          )}

          {done && (
            <Panel title="Slot booked" eyebrow="Give them the token number">
              <p className="font-display text-5xl font-extrabold tracking-tight">{done.token}</p>
              <p className="mt-2 text-sm">
                {dayLabel(done.date)} · {done.slot}
              </p>
              <Note>
                Write the token on their card sleeve. They do not need a phone — the shop can find
                the booking again by tapping the card.
              </Note>
              <Button size="sm" variant="quiet" className="mt-3" onClick={() => setDone(null)}>
                Book for someone else
              </Button>
            </Panel>
          )}

          {found && (
            <Panel
              title={found.card.holder}
              eyebrow={`${found.card.number} · ${found.card.scheme} · ${found.card.members} members`}
            >
              {found.collected ? (
                <p className="text-sm">
                  This household has already collected this cycle. Nothing further is due until the
                  next cycle opens.
                </p>
              ) : found.booking ? (
                <div>
                  <p className="text-sm">
                    Already holds token <strong>{found.booking.token}</strong> for{' '}
                    {dayLabel(found.booking.date)}, {found.booking.slot}
                    {found.booking.shop !== data.shop.code && ` at ${found.booking.shop}`}.
                  </p>
                  <Note>
                    One open token per card. To move them to a different slot, cancel the existing
                    token first.
                  </Note>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {found.days.map((d) => {
                      const open = d.slots.reduce((n, s) => n + s.left, 0)
                      return (
                        <Button
                          key={d.date}
                          size="sm"
                          variant={day === d.date ? 'solid' : 'quiet'}
                          accent="navy"
                          disabled={open === 0}
                          onClick={() => setDay(d.date)}
                        >
                          {dayLabel(d.date)}
                          {open === 0 ? ' · full' : ` · ${open}`}
                        </Button>
                      )
                    })}
                  </div>

                  <div className="space-y-2">
                    {chosen?.slots.map((s) => (
                      <div
                        key={s.time}
                        className="flex items-center justify-between border-b border-ink-rule pb-2 last:border-0"
                      >
                        <span className="font-mono text-sm">{s.time}</span>
                        <span className="flex items-center gap-3">
                          <Pill tone={s.left > 0 ? 'good' : 'warn'}>
                            {s.left > 0 ? `${s.left} left` : 'full'}
                          </Pill>
                          <Button
                            size="sm"
                            accent="navy"
                            disabled={busy || s.left === 0}
                            onClick={() => book(s.time)}
                          >
                            Book
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Button size="sm" variant="quiet" className="mt-4" onClick={() => setFound(null)}>
                ← Tap another card
              </Button>
            </Panel>
          )}
        </div>

        <aside>
          <Panel title="Why this exists" eyebrow="Counter booking">
            <p className="text-sm">
              Most of the households that depend on this system the most are the least likely to
              own a smartphone. Booking only through an app would push them to the back of a queue
              the app created.
            </p>
            <Note>
              A counter booking is recorded as such, so the district can see how much of a shop's
              queue is being booked at the shop itself.
            </Note>
          </Panel>
        </aside>
      </div>
    </>
  )
}
