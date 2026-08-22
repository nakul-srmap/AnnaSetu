import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import { ASSISTANCE_STATUS, DELIVERY_WINDOWS } from '../../data/reference'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Field, { TextInput, Select } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Pill from '../../components/ui/Pill'
import ListRow from '../../components/ui/ListRow'
import Note from '../../components/ui/Note'

// Home delivery is only available on a verified assistance status. Every other
// state gets a screen explaining where the household stands and what to do next
// — never a hidden menu item or a dead end.
export default function HomeDelivery() {
  const { data, applyForAssistance, requestDelivery, busy } = useSession()
  const [ground, setGround] = useState('senior')
  const [member, setMember] = useState('')
  const [documentRef, setDocumentRef] = useState('')

  if (!data) return null

  const { assistance, assistanceGrounds = [], deliveries = [], card } = data
  const status = assistance?.status ?? 'none'
  const badge = ASSISTANCE_STATUS[status]
  const chosen = assistanceGrounds.find((g) => g.id === ground)

  const header = (
    <PageHeader
      eyebrow="Assistance"
      title="Home delivery"
      lede="Delivery to the door, for households that cannot travel to the shop. It is verified by the district before it can be used."
      action={badge && <Pill tone={badge.tone}>{badge.label}</Pill>}
    />
  )

  // ---- verified: the service itself ----
  if (status === 'verified') {
    return (
      <>
        {header}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Request a delivery" eyebrow={`Verified for ${assistance.member}`}>
            <Field label="Deliver to">
              <TextInput defaultValue={card.address} />
            </Field>
            <Field label="Preferred window">
              <Select defaultValue={DELIVERY_WINDOWS[0]}>
                {DELIVERY_WINDOWS.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </Select>
            </Field>
            <Button full disabled={busy} onClick={() => requestDelivery({})}>
              {busy ? 'Sending…' : 'Request delivery'}
            </Button>
            <Note>
              The delivery closes only when you share the OTP at your door, and that is what deducts
              the stock — not the dealer marking it done.
            </Note>
          </Panel>

          <Panel
            title="Your verification"
            eyebrow={assistance.expiresOn ? `Valid until ${assistance.expiresOn}` : 'Approved'}
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['Member', assistance.member],
                ['Ground', assistanceGrounds.find((g) => g.id === assistance.ground)?.label ?? assistance.ground],
                ['Document', assistance.documentRef ?? '—'],
                ['Review date', assistance.expiresOn ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <Note>
              Verification lapses on the review date and has to be renewed. That is deliberate:
              circumstances change, and delivery capacity at a shop is small.
            </Note>

            {deliveries.length > 0 && (
              <div className="mt-4 border-t border-ink-rule pt-4">
                <p className="eyebrow mb-2">Your requests</p>
                {deliveries.map((d) => (
                  <ListRow key={d.id} title={d.window} detail={`${d.id} · ${d.address}`} meta={d.status} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </>
    )
  }

  // ---- pending / rejected / expired: where things stand ----
  if (status === 'pending' || status === 'rejected' || status === 'expired') {
    const copy = {
      pending: {
        title: 'Your application is under review',
        body: 'A district officer checks the document you submitted against the card. You will get an SMS when it is decided.',
      },
      rejected: {
        title: 'Your application was not approved',
        body: assistance.reason ?? 'The district did not approve this application.',
      },
      expired: {
        title: 'Your verification has lapsed',
        body: `It was valid until ${assistance.expiresOn}. Apply again to renew it — the same grounds and document apply.`,
      },
    }[status]

    return (
      <>
        {header}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={copy.title} eyebrow={badge.label}>
            <p className="text-sm">{copy.body}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['Member', assistance.member],
                ['Applied on', assistance.requestedAt?.slice(0, 10) ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {status !== 'pending' && (
              <Note>
                You can apply again from this screen once you have the document listed for your
                ground.
              </Note>
            )}
          </Panel>

          <Panel title="Meanwhile" eyebrow="Collecting this cycle">
            <p className="text-sm">
              Booking a collection slot works as usual, and anyone on the card may collect with it.
              If nobody in the household can travel, the helpline can arrange assisted collection.
            </p>
          </Panel>
        </div>
      </>
    )
  }

  // ---- none: apply ----
  return (
    <>
      {header}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Apply for home delivery" eyebrow="Verified by the district">
          <Field label="Ground for assistance">
            <Select value={ground} onChange={(e) => setGround(e.target.value)}>
              {assistanceGrounds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Which member is this for?">
            <Select value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">Choose a member…</option>
              {card.family?.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} — {m.role}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Document reference"
            hint={chosen ? `Accepted: ${chosen.document}` : undefined}
          >
            <TextInput
              value={documentRef}
              placeholder="Certificate or ID number"
              onChange={(e) => setDocumentRef(e.target.value)}
            />
          </Field>
          <Button
            full
            disabled={busy || !member}
            onClick={() => applyForAssistance({ ground, memberName: member, documentRef })}
          >
            {busy ? 'Submitting…' : 'Submit for verification'}
          </Button>
          <Note>
            Applying does not switch delivery on. A district officer verifies the document against
            the card first, and approval lasts a year before it needs renewing.
          </Note>
        </Panel>

        <Panel title="Who qualifies" eyebrow="Grounds">
          <ul className="space-y-3 text-[13px]">
            {assistanceGrounds.map((g) => (
              <li key={g.id}>
                <span className="font-semibold">{g.label}</span>
                <span className="block text-ink-soft">{g.document}</span>
              </li>
            ))}
          </ul>
          <Note>
            Delivery capacity at a shop is small, so rationing it by need is the point. Everyone else
            books a slot, which exists so that collecting in person is not a burden either.
          </Note>
        </Panel>
      </div>
    </>
  )
}
