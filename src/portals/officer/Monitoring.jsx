import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stat, { StatRow } from '../../components/ui/Stat'
import Table, { Td } from '../../components/ui/Table'
import Bar from '../../components/ui/Bar'
import Note from '../../components/ui/Note'
import Button from '../../components/ui/Button'
import Pill from '../../components/ui/Pill'
import { useState } from 'react'

// A shop asking for stock is a supply decision, so it sits with the supply
// figures rather than in a queue of its own.
function IndentQueue() {
  const { officer, decideIndent, busy } = useSession()
  const [editing, setEditing] = useState(null)
  const [qty, setQty] = useState('')

  const data = officer.indents
  if (!data) return null

  const pending = data.indents.filter((i) => i.status === 'pending')
  const decided = data.indents.filter((i) => i.status !== 'pending').slice(0, 5)

  const sanction = (i) => {
    const amount = Number(qty || i.quantity)
    if (!Number.isFinite(amount) || amount <= 0) return
    decideIndent(i.id, { decision: 'approved', quantity: amount })
    setEditing(null)
    setQty('')
  }

  return (
    <Panel title="Stock requests from shops" eyebrow={`${pending.length} awaiting sanction`}>
      {pending.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No shop is asking for stock. An indent raised at a shop appears here immediately.
        </p>
      ) : (
        pending.map((i) => (
          <div key={i.id} className="border-b border-ink-rule py-3 last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {i.shopName}{' '}
                  <span className="font-mono text-xs font-normal text-ink-soft">{i.shop}</span>
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Asking for {i.quantity} kg of {i.commodity}
                  {i.onHand != null && ` · ${i.onHand} kg on hand`}
                </p>
              </div>
              {editing === i.id ? (
                <div className="flex items-center gap-2">
                  <input
                    className="w-24 rounded border border-ink-rule px-2 py-1.5 font-mono text-xs"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder={String(i.quantity)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button size="sm" disabled={busy} onClick={() => sanction(i)}>Sanction</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={busy}
                    onClick={() => decideIndent(i.id, { decision: 'declined' })}
                  >
                    Decline
                  </Button>
                  <Button size="sm" variant="quiet" disabled={busy} onClick={() => { setEditing(i.id); setQty(String(i.quantity)) }}>
                    Sanction less
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => decideIndent(i.id, { decision: 'approved' })}>
                    Approve {i.quantity} kg
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {decided.length > 0 && (
        <div className="mt-4">
          <Table head={['Shop', 'Asked', { label: 'Decision', align: 'right' }]}>
            {decided.map((i) => (
              <tr key={i.id}>
                <Td mono className="text-xs">{i.shop}</Td>
                <Td mono className="text-xs">{i.quantity} kg {i.commodity}</Td>
                <Td align="right">
                  <Pill tone={i.status === 'approved' ? 'good' : 'warn'}>
                    {i.status === 'approved' ? `${i.sanctioned} kg sanctioned` : 'declined'}
                  </Pill>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <Note>
        A sanctioned indent is what the shop sees against its own stock line, so the dealer learns
        the answer where they asked the question.
      </Note>
    </Panel>
  )
}

export default function Monitoring() {
  const { officer } = useSession()
  const m = officer.monitoring
  if (!m) return <p className="font-mono text-xs text-ink-soft">Loading district figures…</p>

  return (
    <>
      <PageHeader
        eyebrow={`${m.district ? `${m.district} district · ` : ''}cycle ${m.cycle} · ${m.date}`}
        title="Distribution"
        lede="Every figure here is counted from what shops' devices recorded. No shop submits a report to produce it."
      />

      <StatRow>
        <Stat label="Transactions today" value={m.transactionsToday} note="across all shops" />
        <Stat
          label="Cards served this cycle"
          value={m.cardsServed}
          note={`of ${m.cardsTotal} on the register`}
        />
        <Stat label="Coverage" value={m.coverage} unit="%" note="cards collected against cards due" />
        <Stat label="Collected" value={`₹${m.revenue}`} note="issue price recovered" />
      </StatRow>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="By fair price shop" eyebrow="Coverage and bookings">
          <Table
            head={[
              'Shop',
              { label: 'Served', align: 'right' },
              { label: 'Booked', align: 'right' },
              { label: 'Coverage', align: 'right' },
            ]}
          >
            {m.shops.map((s) => (
              <tr key={s.code}>
                <Td>
                  <span className="font-semibold">{s.code}</span>
                  <span className="block text-xs text-ink-soft">{s.mandal}</span>
                </Td>
                <Td align="right" mono>{s.served} / {s.due}</Td>
                <Td align="right" mono>{s.booked}</Td>
                <Td align="right" mono className={s.coverage < 50 ? 'text-brand-stamp' : ''}>
                  {s.coverage}%
                </Td>
              </tr>
            ))}
          </Table>
          <Note>
            Low coverage late in a cycle usually means stock never reached the shop, not that
            households stopped coming.
          </Note>
        </Panel>

        <div className="grid content-start gap-5">
          {m.channels && m.channels.total > 0 && (
            <Panel title="How people booked" eyebrow="Access channels">
              {Object.entries(m.channels.counts).map(([channel, count]) => (
                <div
                  key={channel}
                  className="flex items-center justify-between border-b border-ink-rule py-2.5 last:border-0"
                >
                  <span className="text-sm capitalize">
                    {channel === 'app' ? 'In the app' : channel === 'phone' ? 'Helpline, by phone' : channel === 'sms' ? 'Helpline, by SMS' : channel}
                  </span>
                  <span className="font-mono text-sm">
                    {count} · {Math.round((count / m.channels.total) * 100)}%
                  </span>
                </div>
              ))}
              <p className="mt-3 border-l-2 border-ink-rule pl-3 text-xs text-ink-soft">
                If the offline share falls toward zero, the helpline is not reaching the households
                that need it — not evidence that everyone has a smartphone.
              </p>
            </Panel>
          )}

          <Panel title="Grain issued this cycle" eyebrow="From transaction records">
            {Object.entries(m.grainIssued).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-ink-rule py-2.5 last:border-0">
                <span className="text-sm capitalize">{k}</span>
                <span className="font-mono text-sm">{v} kg</span>
              </div>
            ))}
          </Panel>

          <Panel title="Stock remaining" eyebrow="Against opening receipt">
            {m.shops.map((s) => {
              const total = Object.values(s.opening).reduce((a, b) => a + b, 0)
              const held = Object.values(s.stock).reduce((a, b) => a + b, 0)
              const pct = total ? Math.round((held / total) * 100) : 0
              return <Bar key={s.code} label={`${s.code} — ${held.toLocaleString('en-IN')} kg`} pct={pct} />
            })}
          </Panel>

          {m.recent.length > 0 && (
            <Panel title="Latest transactions" eyebrow="Live">
              <Table head={['Shop', 'Token', { label: 'Paid', align: 'right' }]}>
                {m.recent.map((t) => (
                  <tr key={t.id}>
                    <Td mono className="text-xs">{t.shop}</Td>
                    <Td mono className="text-xs">{t.token}</Td>
                    <Td align="right" mono>₹{t.payable}</Td>
                  </tr>
                ))}
              </Table>
            </Panel>
          )}

          <IndentQueue />
        </div>
      </div>
    </>
  )
}
