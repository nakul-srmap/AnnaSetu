import { useSession } from '../../app/SessionContext'
import { DELIVERY_PARTNERS } from '../../data/reference'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Table, { Td } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

const tone = (status) =>
  status === 'delivered' ? 'good' : status === 'assigned' ? 'info' : 'warn'

export default function Deliveries() {
  const { data, assignDelivery, busy } = useSession()
  if (!data) return null

  const { deliveries, shop } = data

  return (
    <>
      <PageHeader
        eyebrow={`${shop.code} · assistance`}
        title="Delivery requests"
        lede="Requests from cards at this shop with a senior or disabled member recorded."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Panel title="Requests" eyebrow={`${deliveries.length} total`}>
          {deliveries.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No delivery requests. They appear here as soon as an eligible household asks for one.
            </p>
          ) : (
            <Table head={['Household', 'Window', { label: 'Status', align: 'right' }]}>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <span className="font-semibold">{d.holder}</span>
                    <span className="block text-xs text-ink-soft">
                      {d.id} · {d.address}
                    </span>
                  </Td>
                  <Td className="text-xs">{d.window}</Td>
                  <Td align="right">
                    {d.status === 'requested' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        accent="navy"
                        disabled={busy}
                        onClick={() => assignDelivery(d.id, DELIVERY_PARTNERS[0])}
                      >
                        Assign partner
                      </Button>
                    ) : (
                      <Pill tone={tone(d.status)}>
                        {d.partner ? `${d.status} · ${d.partner}` : d.status}
                      </Pill>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Note>
            A delivery closes on the OTP the household shares at the door, and that is what deducts
            the stock — not the dealer marking it done.
          </Note>
        </Panel>

        <Panel title="Partners" eyebrow="Available">
          {DELIVERY_PARTNERS.map((p) => (
            <div
              key={p}
              className="flex items-center justify-between border-b border-ink-rule py-2.5 last:border-0"
            >
              <span className="text-sm">{p}</span>
              <Pill tone="good">free</Pill>
            </div>
          ))}
        </Panel>
      </div>
    </>
  )
}
