import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

export default function ShopProfile() {
  const { data } = useSession()
  if (!data) return null

  const { shop, slots } = data

  return (
    <>
      <PageHeader
        eyebrow={`Licence ${shop.licence}`}
        title="Profile & staff"
        lede="These hours are what households see when booking, so a closed shop stops taking slots."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={shop.code} eyebrow="Shop details">
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ['Name', shop.name],
              ['Dealer', shop.dealer],
              ['Opening hours', shop.timings],
              ['Weekly closing', shop.weeklyClosing],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-1 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <Note>
            Changing hours or licence details is a district action, so a dealer cannot quietly widen
            their own operating window.
          </Note>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Slot capacity" eyebrow="Today">
            <Table head={['Slot', { label: 'Booked', align: 'right' }, { label: 'Free', align: 'right' }]}>
              {slots.map((s) => (
                <tr key={s.time}>
                  <Td mono className="text-xs">{s.time}</Td>
                  <Td align="right" mono>{s.booked} / {s.capacity}</Td>
                  <Td align="right" mono className={s.left === 0 ? 'text-brand-stamp' : ''}>
                    {s.left}
                  </Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel title="Device & staff" eyebrow={shop.device}>
            <Table head={['Name', 'Role', { label: 'Rights', align: 'right' }]}>
              {shop.staff.map((s) => (
                <tr key={s.name}>
                  <Td className="font-semibold">{s.name}</Td>
                  <Td className="text-ink-soft">{s.role}</Td>
                  <Td align="right" className="text-xs">{s.rights}</Td>
                </tr>
              ))}
            </Table>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="good">device paired</Pill>
              <Pill tone="info">scale connected</Pill>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
