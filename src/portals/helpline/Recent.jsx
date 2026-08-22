import { useSession } from '../../app/SessionContext'
import { CHANNEL_LABELS } from '../../data/reference'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

export default function Recent() {
  const { data } = useSession()
  if (!data) return <p className="font-mono text-xs text-ink-soft">Loading…</p>

  const { bookings = [], helpline } = data

  return (
    <>
      <PageHeader
        eyebrow={`Helpline ${helpline?.number ?? ''} · ${helpline?.hours ?? ''}`}
        title="Today's bookings"
        lede="Everything this desk has booked today, so a caller ringing back can be found quickly."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Booked by this desk" eyebrow={`${bookings.length} today`}>
          {bookings.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing booked yet today. Bookings you make for callers appear here.
            </p>
          ) : (
            <Table head={['Token', 'Household', 'Shop & slot', { label: 'Channel', align: 'right' }]}>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <Td mono className="font-semibold">{b.token}</Td>
                  <Td>
                    {b.holder}
                    <span className="block font-mono text-xs text-ink-soft">{b.cardNumber}</span>
                  </Td>
                  <Td className="text-xs">
                    {b.shop}
                    <span className="block text-ink-soft">{b.slot}</span>
                  </Td>
                  <Td align="right">
                    <Pill tone={b.status === 'served' ? 'good' : 'info'}>
                      {CHANNEL_LABELS[b.channel] ?? b.channel}
                    </Pill>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Channels" eyebrow="How people reach us">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="eyebrow">Phone</dt>
              <dd className="mt-1 font-display text-xl font-bold">{helpline?.number}</dd>
              <dd className="text-xs text-ink-soft">{helpline?.hours}</dd>
            </div>
            <div>
              <dt className="eyebrow">SMS</dt>
              <dd className="mt-1 font-mono text-sm">
                {helpline?.smsKeyword} to {helpline?.smsShortcode}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Languages</dt>
              <dd className="mt-1 text-sm">{helpline?.languages?.join(', ')}</dd>
            </div>
          </dl>
          <Note>Calls are free from any network, including from a basic phone.</Note>
        </Panel>
      </div>
    </>
  )
}
