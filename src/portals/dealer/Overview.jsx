import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stat, { StatRow } from '../../components/ui/Stat'
import Button from '../../components/ui/Button'
import ListRow from '../../components/ui/ListRow'
import Alert from '../../components/ui/Alert'
import Pill from '../../components/ui/Pill'

export default function Overview() {
  const { data, setView } = useSession()
  if (!data) return null

  const { shop, queue, waiting, served, stock, slots } = data
  const next = queue.find((q) => q.status === 'booked')
  const low = Object.entries(stock).filter(([, v]) => v < 150)

  return (
    <>
      <PageHeader
        eyebrow={`${shop.code} · ${shop.name} · ${shop.device}`}
        title="Today at a glance"
        lede={`${shop.dealer} · licence ${shop.licence} · ${shop.timings}, closed ${shop.weeklyClosing}.`}
        action={
          <Button accent="navy" size="lg" onClick={() => setView('serve')}>
            {next ? `Serve ${next.token}` : 'Serve the queue'}
          </Button>
        }
      />

      <StatRow>
        <Stat label="Waiting" value={waiting} note={next ? `next: ${next.token} at ${next.slot}` : 'no tokens booked yet'} />
        <Stat label="Served today" value={served} note="recorded on this device" />
        <Stat label="Rice on hand" value={stock.rice.toLocaleString('en-IN')} unit="kg" />
        <Stat label="Slots open" value={slots.reduce((n, s) => n + s.left, 0)} note="across the day" />
      </StatRow>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Queue" eyebrow="Updates on its own as households book">
          {queue.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No tokens booked at this shop today. Bookings appear here as soon as they are made.
            </p>
          ) : (
            queue.slice(0, 5).map((q) => (
              <ListRow
                key={q.id}
                title={q.holder}
                detail={`${q.slot} · ${q.status}${q.assistance ? ' · assistance recorded' : ''}`}
                meta={q.token}
                accent="navy"
                onClick={q.status === 'booked' ? () => setView('serve') : undefined}
              />
            ))
          )}
          {queue.length > 5 && (
            <Button variant="ghost" size="sm" onClick={() => setView('serve')}>
              See all {queue.length} →
            </Button>
          )}
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Stock" eyebrow="On hand">
            {low.length > 0 ? (
              low.map(([k, v]) => (
                <Alert key={k} title={`${k[0].toUpperCase() + k.slice(1)} running low`} tag={`${v} kg`}>
                  Raise an indent before the district flags a shortage at this shop.
                </Alert>
              ))
            ) : (
              <p className="text-sm text-ink-soft">All commodities above the alert threshold.</p>
            )}
            <Button variant="outline" accent="navy" size="sm" className="mt-2" onClick={() => setView('inventory')}>
              Stock &amp; indents
            </Button>
          </Panel>

          <Panel title="Shop status" eyebrow="What households see">
            <div className="flex flex-wrap gap-2">
              <Pill tone="good">{shop.device} online</Pill>
              <Pill tone="info">accepting bookings</Pill>
              <Pill tone="neutral">{shop.staff.length} staff</Pill>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
