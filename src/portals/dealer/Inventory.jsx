import { useEffect, useState } from 'react'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Table, { Td } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'
import Field, { Select, TextInput } from '../../components/ui/Field'

const title = (s) => s[0].toUpperCase() + s.slice(1)

export default function Inventory() {
  const { data, raiseIndent, busy, error } = useSession()

  // Which commodity the dealer is indenting for, and how much. Defaults to
  // whatever is shortest, so the common case is one click.
  const [commodity, setCommodity] = useState(null)
  const [quantity, setQuantity] = useState('')

  const lines = data?.stockLines ?? []
  const chosen = lines.find((l) => l.commodity === commodity) ?? lines.find((l) => l.low) ?? lines[0]

  // Move the form to the shortest item when the stock figures change, unless
  // the dealer has already picked something themselves.
  useEffect(() => {
    if (commodity || !lines.length) return
    const short = lines.find((l) => l.low) ?? lines[0]
    setQuantity(String(short.suggested))
  }, [commodity, lines])

  if (!data) return null

  const { stock, opening, transactions, indents, shop } = data

  const rows = lines.map((l) => ({
    key: l.commodity,
    item: title(l.commodity),
    received: l.opening,
    issuedToday: transactions.reduce((n, t) => n + (t.quantities[l.commodity] ?? 0), 0),
    onHand: l.onHand,
    low: l.low,
    reorder: l.reorder,
  }))

  const lowItems = rows.filter((r) => r.low)
  const pendingFor = (c) => indents.some((i) => i.commodity === c && i.status === 'pending')

  const pick = (c) => {
    setCommodity(c)
    setQuantity(String(lines.find((l) => l.commodity === c)?.suggested ?? 50))
  }

  const submit = () => {
    if (!chosen) return
    const amount = Number(quantity)
    if (!Number.isFinite(amount) || amount <= 0) return
    raiseIndent({ commodity: chosen.commodity, quantity: amount })
  }

  return (
    <>
      <PageHeader
        eyebrow={`${shop.code} · ${shop.device}`}
        title="Stock & indents"
        lede="The opening receipt from the district godown, minus everything this device has issued."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Reconciliation" eyebrow="Current cycle">
          <Table
            head={[
              'Commodity',
              { label: 'Received', align: 'right' },
              { label: 'Issued today', align: 'right' },
              { label: 'On hand', align: 'right' },
              { label: '', align: 'right' },
            ]}
          >
            {rows.map((r) => (
              <tr key={r.key}>
                <Td className="font-semibold">{r.item}</Td>
                <Td align="right" mono>{r.received.toLocaleString('en-IN')}</Td>
                <Td align="right" mono>{r.issuedToday}</Td>
                <Td align="right" mono className={r.low ? 'text-brand-stamp' : ''}>
                  {r.onHand.toLocaleString('en-IN')}
                  <span className="block text-[10px] text-ink-soft">reorder at {r.reorder}</span>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant={r.low ? 'solid' : 'quiet'}
                    accent="navy"
                    disabled={busy || pendingFor(r.key)}
                    onClick={() => pick(r.key)}
                  >
                    {pendingFor(r.key) ? 'Indent pending' : 'Indent'}
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
          <Note>
            Received minus issued must equal what is on hand. Any gap is what the district reads as a
            diversion signal, which is why stock is logged here rather than reported at month end.
          </Note>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Alerts" eyebrow="Automatic">
            {lowItems.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing running low at this shop.</p>
            ) : (
              lowItems.map((r) => (
                <Alert key={r.key} title={`${r.item} running low`} tag={`${r.onHand} kg`}>
                  Below the reorder level for this shop. Raise an indent before households arrive
                  against it.
                </Alert>
              ))
            )}
          </Panel>

          <Panel title="Raise an indent" eyebrow="To the district godown">
            {!chosen ? (
              <p className="text-sm text-ink-soft">No commodities on this shop's register.</p>
            ) : (
              <>
                <Field label="Commodity" hint={`${chosen.onHand} kg on hand · reorder level ${chosen.reorder}`}>
                  <Select value={chosen.commodity} onChange={(e) => pick(e.target.value)}>
                    {lines.map((l) => (
                      <option key={l.commodity} value={l.commodity}>
                        {title(l.commodity)} — {l.onHand} kg{l.low ? ' (low)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Quantity in kilograms"
                  hint={`${chosen.suggested} kg brings this shop back to its opening receipt.`}
                >
                  <TextInput
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={String(chosen.suggested)}
                  />
                </Field>

                {pendingFor(chosen.commodity) ? (
                  <p className="text-sm text-ink-soft">
                    An indent for {chosen.commodity} is already awaiting the district's decision.
                  </p>
                ) : (
                  <Button
                    accent="navy"
                    full
                    disabled={busy || !Number(quantity)}
                    onClick={submit}
                  >
                    Send indent for {Number(quantity) || chosen.suggested} kg
                  </Button>
                )}
                {error && <p className="mt-2 text-xs text-brand-stamp">{error}</p>}
                <Note>
                  The district sees this against your current stock, so the request carries its own
                  justification.
                </Note>
              </>
            )}
          </Panel>

          <Panel title="Indents raised" eyebrow="To the district godown">
            {indents.length === 0 ? (
              <p className="text-sm text-ink-soft">No open indents.</p>
            ) : (
              indents.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between border-b border-ink-rule py-2.5 last:border-0"
                >
                  <span className="text-sm capitalize">
                    {i.commodity} · {i.quantity} kg
                    <span className="block font-mono text-xs text-ink-soft">{i.id}</span>
                  </span>
                  <Pill tone={i.status === 'approved' ? 'good' : i.status === 'declined' ? 'warn' : 'info'}>
                    {i.status === 'approved' ? `${i.sanctioned} kg sanctioned` : i.status}
                  </Pill>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
