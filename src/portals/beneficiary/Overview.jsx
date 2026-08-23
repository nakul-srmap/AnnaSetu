import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import RationCard from '../../components/RationCard'
import Panel from '../../components/ui/Panel'
import Button from '../../components/ui/Button'
import ListRow from '../../components/ui/ListRow'
import Pill from '../../components/ui/Pill'

export default function Overview() {
  const { data, setView, account } = useSession()
  if (!data) return null
  const { card, entitlement, collected, booking, linkedShop } = data

  return (
    <>
      <PageHeader
        eyebrow={`${card.scheme} · card ${card.number}`}
        title={`Namaste, ${card.holder.split(' ')[0]}`}
        lede={
          collected
            ? 'This cycle’s ration is collected. Your receipt is saved against the card.'
            : booking
              ? `Token ${booking.token} is booked for ${booking.slot} at ${booking.shop}.`
              : 'Your entitlement for this cycle is open. Book a slot to collect it.'
        }
        action={
          !collected &&
          (booking ? (
            <Button size="lg" onClick={() => setView('token')}>View token {booking.token}</Button>
          ) : (
            <Button size="lg" onClick={() => setView('book')}>Book a collection slot</Button>
          ))
        }
      />

      {/* What is in force where this household collects, and what to do about
          it. Shown before anything else, because it changes what they should
          do today. */}
      {data.emergency?.guidance && (
        <div className="mb-5 border border-ink-rule border-l-[3px] border-l-brand-stamp bg-white px-4 py-3">
          <h4 className="text-sm font-semibold">{data.emergency.guidance.headline}</h4>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-brand-stamp">
            {data.emergency.reason} · day {data.emergency.day} of{' '}
            {data.emergency.day + data.emergency.daysRemaining - 1}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-ink-soft">
            {data.emergency.guidance.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}


      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-5">
          <Panel title="This cycle" eyebrow="Entitlement">
            <div className="grid gap-px bg-ink-rule sm:grid-cols-3">
              {entitlement.map((e) => (
                <div key={e.key} className="bg-white px-4 py-3">
                  <p className="eyebrow">{e.item}</p>
                  <p className="mt-1 font-display text-2xl font-extrabold tracking-tight">
                    {e.due} <span className="font-body text-sm font-medium text-ink-soft">kg</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">of {e.entitled} kg entitled</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setView('entitlement')}>
                Entitlement &amp; history
              </Button>
              <Button variant="quiet" size="sm" onClick={() => setView('delivery')}>
                {account?.assistance ? 'Request home delivery' : 'Apply for assistance'}
              </Button>
              <Button variant="quiet" size="sm" onClick={() => setView('grievance')}>
                Raise a grievance
              </Button>
            </div>
          </Panel>

          {booking && (
            <Panel title="Your booking" eyebrow="Active token">
              <ListRow
                title={`Token ${booking.token} · ${booking.slot}`}
                detail={`${booking.shop} · number ${booking.position} in this slot`}
                meta="view"
                onClick={() => setView('token')}
              />
            </Panel>
          )}
        </div>

        <div className="grid content-start gap-5">
          <RationCard />
          {linkedShop && (
            <Panel title="Your shop" eyebrow="Linked fair price shop">
              <p className="text-sm font-semibold">{linkedShop.code} — {linkedShop.name}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {linkedShop.timings} · closed {linkedShop.weeklyClosing}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {collected ? <Pill tone="good">collected</Pill> : <Pill tone="warn">not collected</Pill>}
                {booking && <Pill tone="info">token {booking.token}</Pill>}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
