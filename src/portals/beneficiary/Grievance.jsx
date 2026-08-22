import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import { GRIEVANCE_CATEGORIES } from '../../data/reference'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Field, { TextInput, Select } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

export default function Grievance() {
  const { data, fileGrievance, busy } = useSession()
  const [category, setCategory] = useState(GRIEVANCE_CATEGORIES[0])
  const [details, setDetails] = useState('')
  if (!data) return null

  const { grievances, card, receipt } = data

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Grievances"
        lede="Your complaint is filed with the shop’s own transaction record attached, so it is your account plus the device’s."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="File a complaint" eyebrow="Received by the district office">
          <Field label="What happened">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {GRIEVANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Shop">
            <TextInput value={card.shop} readOnly />
          </Field>
          <Field
            label="Details"
            hint={receipt ? `Receipt ${receipt.id} will be attached automatically.` : undefined}
          >
            <TextInput
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What went wrong"
            />
          </Field>
          <Button full disabled={busy} onClick={() => fileGrievance({ category, details })}>
            {busy ? 'Filing…' : 'File grievance'}
          </Button>
        </Panel>

        <Panel title="Your complaints" eyebrow={`${grievances.length} filed`}>
          {grievances.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing filed against this card.</p>
          ) : (
            <Table head={['Ticket', 'Complaint', { label: 'Stage', align: 'right' }]}>
              {grievances.map((g) => (
                <tr key={g.id}>
                  <Td mono className="text-xs">{g.id}</Td>
                  <Td>
                    {g.details || g.category}
                    {g.transactionId && (
                      <span className="block font-mono text-[10px] text-ink-soft">
                        receipt {g.transactionId} attached
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <Pill tone={g.open ? 'warn' : 'good'}>{g.stage}</Pill>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Note>A complaint unresolved after seven days escalates to the district officer automatically.</Note>
        </Panel>
      </div>
    </>
  )
}
