import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import RationCard from '../../components/RationCard'
import Panel from '../../components/ui/Panel'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

export default function Household() {
  const { data } = useSession()
  if (!data) return null
  const { card } = data

  return (
    <>
      <PageHeader
        eyebrow="Your card"
        title="Household & members"
        lede="Who is linked to this card, and the details the shop sees when you arrive."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
          <Panel title="Members" eyebrow={`${card.members} on this card`}>
            <Table head={['Name', 'Relationship']}>
              {card.family.map((m) => (
                <tr key={m.name}>
                  <Td className="font-semibold">{m.name}</Td>
                  <Td className="text-ink-soft">{m.role}</Td>
                </tr>
              ))}
            </Table>
            <Note>
              Entitlement is calculated from the members on the card, so changes take effect from the
              next cycle. Requests go to the district office, not to the shop.
            </Note>
          </Panel>

          <Panel title="Contact" eyebrow="What the shop sees">
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Address', card.address],
                ['Mobile number', card.mobile],
                ['Linked shop', card.shop],
                ['Scheme', card.scheme],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {card.assistance?.status === 'verified' && (
              <div className="mt-4">
                <Pill tone="good">assistance verified · {card.assistance.ground}</Pill>
              </div>
            )}
          </Panel>
        </div>

        <RationCard />
      </div>
    </>
  )
}
