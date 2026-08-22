import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Table, { Td } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

export default function Entitlement() {
  const { data, setView } = useSession()
  if (!data) return null
  const { card, entitlement, collected, history, cycle } = data

  return (
    <>
      <PageHeader
        eyebrow={`${card.scheme} · ${card.members} members · cycle ${cycle}`}
        title="Entitlement & history"
        lede="What this card is due, and every collection recorded against it."
        action={
          collected ? (
            <Button variant="outline" onClick={() => setView('token')}>View receipt</Button>
          ) : (
            <Button onClick={() => setView('book')}>Book a slot</Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={`Cycle ${cycle}`}
          eyebrow="Entitlement resets at the start of each month"
          action={collected ? <Pill tone="good">collected</Pill> : <Pill tone="warn">open</Pill>}
        >
          <Table
            head={[
              'Commodity',
              { label: 'Entitled', align: 'right' },
              { label: 'Collected', align: 'right' },
              { label: 'Rate', align: 'right' },
            ]}
          >
            {entitlement.map((e) => (
              <tr key={e.key}>
                <Td>{e.item}</Td>
                <Td align="right" mono>{e.entitled} kg</Td>
                <Td align="right" mono>{e.collected} kg</Td>
                <Td align="right" mono>₹{e.rate}</Td>
              </tr>
            ))}
          </Table>
          <Note>
            {card.scheme === 'AAY'
              ? 'Antyodaya cards receive a flat 35 kg per household, regardless of member count.'
              : 'Priority household cards receive 5 kg of foodgrain per member per month.'}
          </Note>
        </Panel>

        <Panel title="Collection history" eyebrow={`${history.length} recorded`}>
          {history.length === 0 ? (
            <p className="text-sm text-ink-soft">No collections recorded against this card yet.</p>
          ) : (
            <Table head={['Cycle', 'Shop', { label: 'Paid', align: 'right' }]}>
              {history.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <span className="font-semibold">{t.cycle}</span>
                    <span className="block text-xs text-ink-soft">
                      {Object.entries(t.quantities).map(([k, v]) => `${v} kg ${k}`).join(' · ')}
                    </span>
                  </Td>
                  <Td mono className="text-xs">{t.shop}</Td>
                  <Td align="right" mono>₹{t.payable}</Td>
                </tr>
              ))}
            </Table>
          )}
          <Note>Each row is signed by the device that issued it and cannot be edited afterwards.</Note>
        </Panel>
      </div>
    </>
  )
}
