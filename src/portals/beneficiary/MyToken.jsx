import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Button from '../../components/ui/Button'
import QrCode from '../../components/QrCode'
import Table, { Td } from '../../components/ui/Table'
import Note from '../../components/ui/Note'
import Pill from '../../components/ui/Pill'

export default function MyToken() {
  const { data, cancelBooking, busy, setView } = useSession()
  if (!data) return null
  const { booking, collected, receipt } = data

  if (collected && receipt) {
    return (
      <>
        <PageHeader
          eyebrow={`${receipt.shop} · ${receipt.device}`}
          title="Collected"
          lede="Signed by the shop’s device and recorded against your card."
          action={<Pill tone="good">receipt {receipt.id}</Pill>}
        />
        <Panel title="Receipt" eyebrow={new Date(receipt.issuedAt).toLocaleString('en-IN')}>
          <Table head={['Commodity', { label: 'Issued', align: 'right' }, { label: 'Paid', align: 'right' }]}>
            {Object.entries(receipt.quantities).map(([k, v]) => (
              <tr key={k}>
                <Td className="capitalize">{k}</Td>
                <Td align="right" mono>{v} kg</Td>
                <Td align="right" mono>{k === 'rice' ? `₹${v}` : k === 'wheat' ? `₹${v * 2}` : `₹${Math.round(v * 13.5)}`}</Td>
              </tr>
            ))}
            <tr>
              <Td><b>Total paid</b></Td>
              <Td />
              <Td align="right" mono><b>₹{receipt.payable}</b></Td>
            </tr>
          </Table>
          <Button variant="quiet" size="sm" className="mt-4" onClick={() => setView('grievance')}>
            Something was wrong with this collection
          </Button>
        </Panel>
      </>
    )
  }

  if (!booking) {
    return (
      <>
        <PageHeader title="My token" lede="You do not have an active token." />
        <Panel>
          <p className="text-sm">Book a collection slot and your token appears here with its QR code.</p>
          <Button className="mt-3" onClick={() => setView('book')}>Book a collection slot</Button>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={`${booking.shop} · ${booking.slot}`}
        title={`Token ${booking.token}`}
        lede="Show this at the shop. Nothing is issued against your card until the dealer scans it and your identity is confirmed."
      />

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border border-dashed border-ink/45 bg-white px-6 py-6 text-center">
          <p className="font-display text-5xl font-extrabold leading-none tracking-tight">
            {booking.token}
          </p>
          <p className="eyebrow mt-2">{booking.slot}</p>
          <div className="mt-4 flex justify-center">
            <QrCode value={booking.qr} label={`Token ${booking.token}`} />
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-soft">
            Hold this up to the dealer’s scanner
          </p>
          <div className="mt-4 flex justify-between border-t border-ink-rule pt-2.5 font-mono text-[11px] text-ink-soft">
            <span>{booking.shop}</span>
            <span>Number {booking.position} in this slot</span>
          </div>
        </div>

        <div className="grid content-start gap-5">
          <Panel title="At the shop" eyebrow="Three checks">
            <ol className="space-y-3 text-sm">
              {[
                ['Token scan', 'The dealer scans this code and your card details load on their device.'],
                ['Identity check', 'Confirmed against the card before anything is issued.'],
                ['Weigh and receipt', 'Weights come from the paired scale, then the receipt is recorded for both of you.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 font-mono text-[10px] text-ink-soft">0{i + 1}</span>
                  <span>
                    <span className="font-semibold">{t}</span>
                    <span className="block text-xs text-ink-soft">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Need a different time?" eyebrow="Cancel">
            <p className="text-sm">
              Cancelling releases your place to the next household and lets you book another slot
              today.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={busy}
              onClick={() => cancelBooking(booking.id)}
            >
              Cancel this booking
            </Button>
            <Note>This screen updates on its own once the dealer serves your token.</Note>
          </Panel>
        </div>
      </div>
    </>
  )
}
