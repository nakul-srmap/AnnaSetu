import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Field, { TextInput } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import ListRow from '../../components/ui/ListRow'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

// The screen an operator uses with a caller on the line: find the card, read
// the entitlement out, book a slot, then read the token back.
export default function Lookup() {
  const { lookupCard, bookForCaller, cancelForCaller, busy, refresh } = useSession()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [shop, setShop] = useState(null)
  const [confirmed, setConfirmed] = useState(null)

  const search = async () => {
    setConfirmed(null)
    setShop(null)
    const r = await lookupCard(query.trim())
    setResult(r)
  }

  const book = async (slotTime) => {
    const r = await bookForCaller({
      cardNumber: result.card.number,
      shop: shop.code,
      slot: slotTime,
      channel: 'phone',
    })
    if (!r) return
    setConfirmed(r.readBack)
    setResult(null)
    refresh()
  }

  return (
    <>
      <PageHeader
        eyebrow="Caller on the line"
        title="Look up a card"
        lede="Ask for the mobile number they are calling from, or the number printed on the ration card."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-5">
          <Panel title="Find the household" eyebrow="Mobile number or card number">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Number" className="mb-0 min-w-[240px] flex-1">
                <TextInput
                  value={query}
                  placeholder="98490 41234 or 28AP-0417-9930"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                  autoFocus
                />
              </Field>
              <Button accent="stamp" onClick={search} disabled={busy || !query.trim()}>
                {busy ? 'Searching…' : 'Search'}
              </Button>
            </div>
          </Panel>

          {confirmed && (
            <Panel title="Read this back to the caller" eyebrow="Booking confirmed">
              <p className="font-display text-3xl font-extrabold tracking-tight">
                Token {confirmed.token}
              </p>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed">{confirmed.instruction}</p>
              <Note>
                Say the token number one digit at a time, then ask them to repeat it back. They do
                not need the app or a smartphone to collect — the shop looks the token up.
              </Note>
            </Panel>
          )}

          {result && (
            <>
              <Panel title={result.card.holder} eyebrow={`${result.card.scheme} · ${result.card.number}`}>
                <dl className="grid gap-4 sm:grid-cols-3">
                  {[
                    ['Members', result.card.members],
                    ['Linked shop', result.card.shop],
                    ['Address', result.card.address],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="eyebrow">{k}</dt>
                      <dd className="mt-1 text-sm font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.collected && <Pill tone="good">already collected this cycle</Pill>}
                  {result.card.assistance?.status === 'verified' && (
                    <Pill tone="info">assistance: {result.card.assistance.ground}</Pill>
                  )}
                  {result.booking && <Pill tone="warn">token {result.booking.token} already booked</Pill>}
                </div>

                <Table
                  className="mt-4"
                  head={['Commodity', { label: 'Due', align: 'right' }, { label: 'Rate', align: 'right' }]}
                >
                  {result.entitlement.map((e) => (
                    <tr key={e.key}>
                      <Td>{e.item}</Td>
                      <Td align="right" mono>{e.due} kg</Td>
                      <Td align="right" mono>₹{e.rate}/kg</Td>
                    </tr>
                  ))}
                </Table>
              </Panel>

              {result.booking ? (
                <Panel title="Existing booking" eyebrow="Read back or cancel">
                  <p className="text-sm">
                    Token <b>{result.booking.token}</b> at {result.booking.shop},{' '}
                    {result.booking.slot}.
                  </p>
                  <Button
                    variant="outline"
                    accent="stamp"
                    size="sm"
                    className="mt-3"
                    disabled={busy}
                    onClick={async () => {
                      await cancelForCaller(result.booking.id)
                      search()
                    }}
                  >
                    Cancel it and book another time
                  </Button>
                </Panel>
              ) : result.collected ? (
                <Panel title="Nothing to book" eyebrow="Cycle closed">
                  <p className="text-sm">
                    This card has already collected this cycle. Tell the caller the next cycle opens
                    on the 1st.
                  </p>
                </Panel>
              ) : !shop ? (
                <Panel title="Which shop?" eyebrow={`Shops in ${result.card.district} district`}>
                  {result.shops.map((s) => (
                    <ListRow
                      key={s.code}
                      title={`${s.code} — ${s.name}${s.linked ? ' · their linked shop' : ''}`}
                      detail={`${s.address} · ${s.slots.filter((x) => x.left > 0).length} slots open`}
                      meta="choose"
                      accent="stamp"
                      onClick={() => setShop(s)}
                    />
                  ))}
                </Panel>
              ) : (
                <Panel
                  title={`Slots at ${shop.code}`}
                  eyebrow="Read the open times out and let them choose"
                  action={
                    <Button variant="ghost" size="sm" onClick={() => setShop(null)}>
                      ← Different shop
                    </Button>
                  }
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {shop.slots.map((s) => (
                      <ListRow
                        key={s.time}
                        title={s.time}
                        detail={`${s.booked} of ${s.capacity} booked`}
                        meta={s.left === 0 ? 'full' : `${s.left} left`}
                        disabled={s.left === 0 || busy}
                        accent="stamp"
                        onClick={s.left === 0 ? undefined : () => book(s.time)}
                      />
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>

        <Panel title="On the call" eyebrow="Script">
          <ol className="space-y-3 text-[13px]">
            {[
              'Ask for the mobile number on the card, or the card number itself.',
              'Confirm the name on screen matches the person calling.',
              'Read out what the card is due this cycle.',
              'Read the open slots; let them pick one.',
              'Read the token back digit by digit and ask them to repeat it.',
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 font-mono text-[10px] text-ink-soft">0{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <Note>
            A phone booking produces the same token as one made in the app, so the shop sees a single
            queue and nobody is served differently for not owning a smartphone.
          </Note>
        </Panel>
      </div>
    </>
  )
}
