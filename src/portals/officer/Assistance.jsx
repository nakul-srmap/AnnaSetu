import { useState } from 'react'
import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Stat, { StatRow } from '../../components/ui/Stat'
import Table, { Td } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Field, { TextInput } from '../../components/ui/Field'
import Pill from '../../components/ui/Pill'
import Note from '../../components/ui/Note'

const GROUND_LABELS = {
  senior: 'Member aged 60+',
  disability: 'Disability certificate',
  medical: 'Temporary medical',
  sole: 'Sole member, cannot travel',
}

// The control that decides who may use home delivery. Approving is one click;
// refusing requires a reason, because the household reads it.
export default function Assistance() {
  const { officer, decideAssistance, busy } = useSession()
  const [refusing, setRefusing] = useState(null)
  const [reason, setReason] = useState('')

  const queue = officer.assistance
  if (!queue) return <p className="font-mono text-xs text-ink-soft">Loading applications…</p>

  const { pending = [], verified = [], expired = [] } = queue

  return (
    <>
      <PageHeader
        eyebrow="Verification"
        title="Assistance applications"
        lede="Home delivery is unavailable until an application here is approved. Approvals last a year, then lapse for review."
      />

      <StatRow>
        <Stat label="Awaiting decision" value={pending.length} note="households applied" />
        <Stat label="Verified" value={verified.length} note="delivery available to them" />
        <Stat label="Lapsed" value={expired.length} note="need renewing" />
      </StatRow>

      <div className="mt-5 grid gap-5">
        <Panel title="Awaiting your decision" eyebrow={`${pending.length} application${pending.length === 1 ? '' : 's'}`}>
          {pending.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing awaiting a decision in your district.</p>
          ) : (
            pending.map((p) => (
              <div key={p.cardNumber} className="border-b border-ink-rule py-4 last:border-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {p.holder}{' '}
                      <span className="font-mono text-xs font-normal text-ink-soft">
                        {p.cardNumber}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {p.shop} · {p.mandal} · {p.members} members
                    </p>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        ['Ground', GROUND_LABELS[p.assistance.ground] ?? p.assistance.ground],
                        ['For member', p.assistance.member],
                        ['Document', p.assistance.documentRef ?? 'none supplied'],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className="eyebrow">{k}</dt>
                          <dd className="mt-0.5 text-[13px] font-semibold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      accent="orange"
                      size="sm"
                      disabled={busy}
                      onClick={() => decideAssistance(p.cardNumber, { approve: true, months: 12 })}
                    >
                      Approve for a year
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        setRefusing(refusing === p.cardNumber ? null : p.cardNumber)
                        setReason('')
                      }}
                    >
                      Refuse
                    </Button>
                  </div>
                </div>

                {refusing === p.cardNumber && (
                  <div className="mt-4 border-l-2 border-brand-stamp pl-4">
                    <Field label="Reason the household will read" className="mb-2">
                      <TextInput
                        value={reason}
                        placeholder="e.g. Document does not match a member on this card"
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !reason.trim()}
                      onClick={async () => {
                        await decideAssistance(p.cardNumber, { approve: false, reason })
                        setRefusing(null)
                      }}
                    >
                      Record refusal
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
          <Note>
            A refusal without a reason is rejected by the API. The household sees exactly what you
            write here, so it has to be something they can act on.
          </Note>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Verified households" eyebrow="Delivery available">
            {verified.length === 0 ? (
              <p className="text-sm text-ink-soft">None verified in your district.</p>
            ) : (
              <Table head={['Household', 'Ground', { label: 'Review date', align: 'right' }]}>
                {verified.map((v) => (
                  <tr key={v.cardNumber}>
                    <Td>
                      <span className="font-semibold">{v.holder}</span>
                      <span className="block font-mono text-xs text-ink-soft">{v.shop}</span>
                    </Td>
                    <Td className="text-xs">
                      {GROUND_LABELS[v.assistance.ground] ?? v.assistance.ground}
                    </Td>
                    <Td align="right" mono className="text-xs">
                      {v.assistance.expiresOn}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel title="Lapsed" eyebrow="Delivery switched off until renewed">
            {expired.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing lapsed.</p>
            ) : (
              expired.map((e) => (
                <div
                  key={e.cardNumber}
                  className="flex items-center justify-between border-b border-ink-rule py-2.5 last:border-0"
                >
                  <span className="text-sm">
                    {e.holder}
                    <span className="block font-mono text-xs text-ink-soft">
                      expired {e.assistance.expiresOn}
                    </span>
                  </span>
                  <Pill tone="warn">lapsed</Pill>
                </div>
              ))
            )}
            <Note>
              A lapsed verification stops delivery on its own, without anyone running a job. The
              household is told it needs renewing rather than finding a dead button.
            </Note>
          </Panel>
        </div>
      </div>
    </>
  )
}
