import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Button from '../../components/ui/Button'
import Note from '../../components/ui/Note'
import Pill from '../../components/ui/Pill'
import Table, { Td } from '../../components/ui/Table'
import RfidReader from '../../components/RfidReader'

const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

// Stock arriving from the district godown.
//
// Every bag on the truck carries an RFID tag written when the load was made up.
// The dealer taps each one as it comes off: the weight goes straight onto the
// shelf figure and the bag is struck off the manifest. Nobody types a quantity,
// so what the shop records as received is what the godown recorded as
// dispatched — and the gap between those two numbers is exactly where stock
// goes missing today.
export default function Receiving() {
  const { data, receiveBag, busy, error } = useSession()
  const [last, setLast] = useState(null)

  if (!data) return null

  const manifest = data.manifest ?? []
  const received = data.receivedToday ?? []
  const pending = manifest.filter((m) => !m.complete)

  const onTap = async (tag) => {
    const r = await receiveBag(tag)
    if (r) setLast(r.received)
  }

  return (
    <>
      <PageHeader
        eyebrow={`${data.shop.code} · ${data.date}`}
        title="Receive stock"
        lede="Tap each bag as it comes off the truck. The weight on the tag is what goes onto the shelf figure."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Panel title="Tap the bag" eyebrow="Consignment tag">
            <RfidReader onRead={onTap} busy={busy} />
            {error && <p className="mt-2 text-xs text-brand-stamp">{error}</p>}
            {last && (
              <p className="mt-3 text-sm">
                Received <strong>{last.weightKg} kg</strong> of {last.commodity}.
              </p>
            )}
          </Panel>

          <Panel
            title="Loads on the way"
            eyebrow={pending.length ? `${pending.length} awaiting delivery` : 'Nothing outstanding'}
          >
            {manifest.length === 0 ? (
              <p className="text-sm text-ink-soft">
                No consignment has been dispatched to this shop. A load appears here as soon as the
                district sanctions an indent.
              </p>
            ) : (
              <Table head={['Indent', 'Commodity', 'Bags', { label: 'Received', align: 'right' }]}>
                {manifest.map((m) => (
                  <tr key={m.indentId}>
                    <Td mono className="text-xs">{m.indentId}</Td>
                    <Td>{title(m.commodity)}</Td>
                    <Td mono className="text-xs">
                      {m.received}/{m.bags}
                    </Td>
                    <Td align="right">
                      <Pill tone={m.complete ? 'good' : 'warn'}>
                        {m.receivedKg}/{m.expectedKg} kg
                      </Pill>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
            <Note>
              A load that was dispatched but never tapped stays open here, and the district sees the
              same gap from its side.
            </Note>
          </Panel>

          {received.length > 0 && (
            <Panel title="Received today" eyebrow={`${received.length} bags`}>
              <Table head={['Tag', 'Commodity', { label: 'Weight', align: 'right' }]}>
                {received.map((b) => (
                  <tr key={b.tag}>
                    <Td mono className="text-xs">{b.tag.slice(0, 12)}…</Td>
                    <Td>{title(b.commodity)}</Td>
                    <Td align="right" mono className="text-xs">{b.weightKg} kg</Td>
                  </tr>
                ))}
              </Table>
            </Panel>
          )}
        </div>

        <aside>
          <Panel title="On hand now" eyebrow="Updated as bags are tapped">
            {(data.stockLines ?? []).map((l) => (
              <div
                key={l.commodity}
                className="flex items-baseline justify-between border-b border-ink-rule py-2 last:border-0"
              >
                <span className="text-sm">{title(l.commodity)}</span>
                <span className={`font-mono text-sm ${l.low ? 'text-brand-stamp' : ''}`}>
                  {l.onHand.toLocaleString('en-IN')} kg
                </span>
              </div>
            ))}
            <Note>
              Stock rises only when a tagged bag is tapped, so the shelf figure cannot be adjusted
              by hand to cover a shortfall.
            </Note>
          </Panel>
        </aside>
      </div>
    </>
  )
}
