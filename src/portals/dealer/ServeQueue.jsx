import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../app/SessionContext'
import { CHANNEL_LABELS } from '../../data/reference'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stepper from '../../components/ui/Stepper'
import Button from '../../components/ui/Button'
import ListRow from '../../components/ui/ListRow'
import Field, { TextInput } from '../../components/ui/Field'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'
import QrScanner from '../../components/QrScanner'
import RfidReader from '../../components/RfidReader'

const STEPS = ['Scan token', 'Confirm card', 'Weigh & issue', 'Receipt']

export default function ServeQueue() {
  const { data, scan, readTag, issue, busy } = useSession()
  // The counter identifies a household either by scanning their token or by
  // tapping the ration card. Both land on the same confirmation screen.
  const [method, setMethod] = useState('qr')
  const [step, setStep] = useState(0)
  const [scanned, setScanned] = useState(null) // { booking, card, entitled }
  const [qty, setQty] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const queue = data?.queue ?? []
  const waiting = useMemo(() => queue.filter((q) => q.status === 'booked'), [queue])

  // If the token being served disappears from the queue (cancelled elsewhere),
  // drop back to scanning rather than issuing against a stale booking.
  useEffect(() => {
    if (!scanned || step === 3) return
    const still = queue.find((q) => q.token === scanned.booking.token && q.status === 'booked')
    if (!still) {
      setScanned(null)
      setStep(0)
    }
  }, [queue, scanned, step])

  if (!data) return null

  // The raw payload goes to the server, which checks the shop and card it was
  // issued for — the client never decides whether a token is valid here.
  const onScan = async ({ payload, manual }) => {
    const result = await scan(payload, manual)
    if (!result) return
    setScanned(result)
    setQty(result.entitled)
    setStep(1)
  }

  const onTap = async (tag) => {
    const result = await readTag(tag)
    if (!result) return
    setScanned(result)
    setQty(result.entitled)
    setStep(1)
  }

  const payable = qty
    ? Math.round((qty.rice ?? 0) * 1 + (qty.wheat ?? 0) * 2 + (qty.sugar ?? 0) * 13.5)
    : 0

  return (
    <>
      <PageHeader
        eyebrow={`${data.shop.code} · ${data.date}`}
        title="Serve the queue"
        lede={
          waiting.length > 0
            ? `${waiting.length} token${waiting.length === 1 ? '' : 's'} waiting. Scan the household's QR to begin.`
            : 'No tokens waiting. Bookings appear here as soon as a household makes one.'
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Booked today" eyebrow={`${waiting.length} waiting · ${data.served} served`}>
          {queue.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing booked yet. This list refreshes on its own.
            </p>
          ) : (
            queue.map((q) => (
              <ListRow
                key={q.id}
                title={q.holder}
                detail={`${q.slot} · ${q.scheme}${q.assistance ? ' · assistance' : ''} · ${q.status}${q.channel && q.channel !== 'app' ? ` · booked ${CHANNEL_LABELS[q.channel] ?? q.channel}` : ''}`}
                meta={q.token}
                accent="navy"
                onClick={
                  q.status === 'booked'
                    ? () => { setStep(0); setScanned(null) }
                    : undefined
                }
              />
            ))
          )}
          <Note>Walk-ins without a booking are served by keying the token in by hand.</Note>
        </Panel>

        <div>
          <Stepper steps={STEPS} current={step} accent="navy" />

          {step === 0 && (
            <Panel
              title={method === 'qr' ? "Scan the household's QR" : 'Tap the ration card'}
              eyebrow={method === 'qr' ? 'Decoded on this device' : 'RFID reader at the counter'}
            >
              <div className="mb-4 flex gap-2">
                <Button
                  size="sm"
                  variant={method === 'qr' ? 'solid' : 'quiet'}
                  accent="navy"
                  onClick={() => setMethod('qr')}
                >
                  Scan QR
                </Button>
                <Button
                  size="sm"
                  variant={method === 'rfid' ? 'solid' : 'quiet'}
                  accent="navy"
                  onClick={() => setMethod('rfid')}
                >
                  Tap card
                </Button>
              </div>

              {method === 'rfid' ? (
                <RfidReader onRead={onTap} busy={busy} sampleTag={waiting[0]?.rfidTag ?? null} />
              ) : waiting.length === 0 ? (
                <>
                  <p className="text-sm">
                    No tokens are waiting at {data.shop.code} right now. As soon as a household
                    books, their token appears in the list and can be scanned.
                  </p>
                  <Note>
                    The scanner stays available for portable transactions — a card booked at another
                    shop can still be keyed in and verified.
                  </Note>
                  <div className="mt-4">
                    <QrScanner accent="navy" onScan={onScan} />
                  </div>
                </>
              ) : (
                <QrScanner
                  accent="navy"
                  expectedTokens={waiting.map((q) => q.token)}
                  onScan={onScan}
                />
              )}
            </Panel>
          )}

          {step === 1 && scanned && (
            <Panel title="Confirm the card" eyebrow={`Token ${scanned.booking.token} · ${scanned.booking.slot}`}>
              <dl className="mb-4 grid gap-4 sm:grid-cols-2">
                {[
                  ['Cardholder', scanned.card.holder],
                  ['Card number', scanned.card.number],
                  ['Scheme', `${scanned.card.scheme} · ${scanned.card.members} members`],
                  ['Assistance', scanned.card.assistance?.status === 'verified' ? (scanned.card.assistance.ground ?? 'verified') : 'None recorded'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="eyebrow">{k}</dt>
                    <dd className="mt-1 text-sm font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <Table head={['Commodity', { label: 'Entitled', align: 'right' }, { label: 'Already collected', align: 'right' }]}>
                {scanned.entitlement.map((e) => (
                  <tr key={e.key}>
                    <Td>{e.item}</Td>
                    <Td align="right" mono>{e.entitled} kg</Td>
                    <Td align="right" mono>{e.collected} kg</Td>
                  </tr>
                ))}
              </Table>
              {scanned.manual && (
                <div className="mt-3">
                  <Pill tone="warn">keyed in by hand · recorded as an exception</Pill>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button accent="navy" onClick={() => setStep(2)}>Continue to weigh</Button>
                <Button variant="ghost" onClick={() => { setScanned(null); setStep(0) }}>
                  ← Back to scan
                </Button>
              </div>
            </Panel>
          )}

          {step === 2 && scanned && qty && (
            <Panel title="Weigh and issue" eyebrow="Quantities come from the paired scale">
              <div className="grid gap-x-5 sm:grid-cols-3">
                {Object.keys(qty).map((key) => (
                  <Field key={key} label={`${key[0].toUpperCase() + key.slice(1)} (kg)`}>
                    <TextInput
                      value={qty[key]}
                      inputMode="decimal"
                      onChange={(e) => setQty({ ...qty, [key]: Number(e.target.value) || 0 })}
                    />
                  </Field>
                ))}
              </div>
              <p className="font-display text-xl font-bold">Collectable ₹{payable}</p>
              <div className="mt-4 flex gap-2">
                <Button
                  accent="navy"
                  size="lg"
                  disabled={busy}
                  onClick={async () => {
                    const r = await issue(scanned.booking.id, qty)
                    if (r) { setReceipt(r); setStep(3) }
                  }}
                >
                  {busy ? 'Recording…' : 'Confirm and record'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              </div>
              <Note>
                Recording deducts from this shop&apos;s stock and closes the card&apos;s entitlement
                for the cycle. The server rejects anything above entitlement or stock on hand.
              </Note>
            </Panel>
          )}

          {step === 3 && receipt && (
            <Panel title="Recorded" eyebrow={`${receipt.id} · ${new Date(receipt.issuedAt).toLocaleTimeString('en-IN')}`}>
              <Table head={['Commodity', { label: 'Issued', align: 'right' }]}>
                {Object.entries(receipt.quantities).map(([k, v]) => (
                  <tr key={k}>
                    <Td className="capitalize">{k}</Td>
                    <Td align="right" mono>{v} kg</Td>
                  </tr>
                ))}
                <tr>
                  <Td><b>Collected</b></Td>
                  <Td align="right" mono><b>₹{receipt.payable}</b></Td>
                </tr>
              </Table>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  accent="navy"
                  onClick={() => { setReceipt(null); setScanned(null); setQty(null); setStep(0) }}
                >
                  Serve the next token
                </Button>
              </div>
              <Note>
                The household&apos;s own screen now shows this receipt, and the district&apos;s
                figures include it. Nobody has to report anything.
              </Note>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
