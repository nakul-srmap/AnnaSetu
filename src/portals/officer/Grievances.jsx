import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stat, { StatRow } from '../../components/ui/Stat'
import Table, { Td } from '../../components/ui/Table'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'
import Button from '../../components/ui/Button'
import Field, { TextInput } from '../../components/ui/Field'

// The stages a ticket moves through. A complaint that can only be read is not
// a grievance system, so every open ticket carries the next action with it.
const STAGES = ['inspection assigned', 'shop responded', 'recovery ordered']

export default function Grievances() {
  const { officer, setGrievanceStage, busy } = useSession()
  const [closing, setClosing] = useState(null)
  const [outcome, setOutcome] = useState('')

  const g = officer.grievances
  if (!g) return <p className="font-mono text-xs text-ink-soft">Loading grievances…</p>

  const advance = (id, stage) => setGrievanceStage(id, { stage })

  const close = (id) => {
    if (!outcome.trim()) return
    setGrievanceStage(id, { stage: outcome.trim(), close: true })
    setClosing(null)
    setOutcome('')
  }

  return (
    <>
      <PageHeader
        eyebrow="Control"
        title="Grievances"
        lede="Complaints arrive with the shop's own transaction record attached, so an inspector knows what the device logged before they leave."
      />

      <StatRow>
        <Stat label="Open" value={g.stats.open} note="awaiting action" />
        <Stat label="Total filed" value={g.stats.total} note="all time" />
        <Stat label="With a receipt attached" value={g.stats.withReceipt} note="machine record available" />
      </StatRow>

      <div className="mt-5">
        <Panel title="Tickets" eyebrow="District queue">
          {g.tickets.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No grievances filed. One raised in a beneficiary portal appears here immediately.
            </p>
          ) : (
            <Table head={['Ticket', 'Shop', 'Complaint', 'Stage', { label: 'Action', align: 'right' }]}>
              {g.tickets.map((t) => (
                <tr key={t.id}>
                  <Td mono className="text-xs">
                    {t.id}
                    <span className="block text-ink-soft">{t.transactionId ?? 'no receipt'}</span>
                  </Td>
                  <Td mono className="text-xs">{t.shop}</Td>
                  <Td>
                    <span>{t.details || t.category}</span>
                    <span className="block text-xs text-ink-soft">{t.holder}</span>
                  </Td>
                  <Td><Pill tone={t.open ? 'warn' : 'good'}>{t.stage}</Pill></Td>
                  <Td align="right">
                    {!t.open ? (
                      <span className="font-mono text-xs text-ink-soft">closed</span>
                    ) : closing === t.id ? (
                      <div className="flex flex-col items-end gap-2">
                        <Field label="Outcome recorded for the household">
                          <TextInput
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                            placeholder="2 kg rice recovered and reissued"
                          />
                        </Field>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setClosing(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" disabled={busy || !outcome.trim()} onClick={() => close(t.id)}>
                            Close ticket
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {STAGES.filter((st) => st !== t.stage).map((st) => (
                          <Button
                            key={st}
                            size="sm"
                            variant="quiet"
                            disabled={busy}
                            onClick={() => advance(t.id, st)}
                          >
                            {st}
                          </Button>
                        ))}
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setClosing(t.id)}>
                          Resolve
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Note>
            A complaint with a receipt attached is the household's account plus the machine's, which
            is what makes a short-weight claim actionable instead of contested.
          </Note>
        </Panel>
      </div>
    </>
  )
}
