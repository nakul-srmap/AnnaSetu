import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stat, { StatRow } from '../../components/ui/Stat'
import Table, { Td } from '../../components/ui/Table'
import Note from '../../components/ui/Note'

export default function Masters() {
  const { officer } = useSession()
  const m = officer.masters
  if (!m) return <p className="font-mono text-xs text-ink-soft">Loading registers…</p>

  return (
    <>
      <PageHeader
        eyebrow={m.district ? `${m.district} district registers` : 'District registers'}
        title="Cards & shops"
        lede="The registers everything else reads from. Entitlement is derived from these, so changes here move what a card is due."
      />

      <StatRow>
        <Stat label="Ration cards" value={m.cards.total} note="on the district register" />
        <Stat label="Members covered" value={m.cards.members} note="across all cards" />
        <Stat label="With assistance" value={m.cards.withAssistance} note="senior or disabled member" />
        <Stat label="Fair price shops" value={m.shops.length} note="with paired devices" />
      </StatRow>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Cards by scheme" eyebrow="Entitlement rules">
          <Table head={['Scheme', { label: 'Cards', align: 'right' }]}>
            {Object.entries(m.cards.byScheme).map(([scheme, count]) => (
              <tr key={scheme}>
                <Td>
                  <span className="font-semibold">{scheme}</span>
                  <span className="block text-xs text-ink-soft">
                    {scheme === 'AAY' ? '35 kg per household' : '5 kg per member'}
                  </span>
                </Td>
                <Td align="right" mono>{count}</Td>
              </tr>
            ))}
          </Table>
          <Note>
            Scheme decides the entitlement formula, so moving a card between schemes changes what the
            shop is allowed to issue from the next cycle.
          </Note>
        </Panel>

        <Panel title="Fair price shops" eyebrow="Licences and devices">
          <Table head={['Shop', 'Dealer', { label: 'Device', align: 'right' }]}>
            {m.shops.map((s) => (
              <tr key={s.code}>
                <Td>
                  <span className="font-semibold">{s.code}</span>
                  <span className="block text-xs text-ink-soft">{s.name} · {s.mandal}</span>
                </Td>
                <Td className="text-xs">{s.dealer}</Td>
                <Td align="right" mono className="text-xs">{s.device}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </>
  )
}
