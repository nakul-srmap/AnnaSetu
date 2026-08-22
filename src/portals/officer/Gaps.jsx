import { useSession } from '../../app/SessionContext'
import PageHeader from '../../components/layout/PageHeader'
import Panel from '../../components/ui/Panel'
import Alert from '../../components/ui/Alert'
import Note from '../../components/ui/Note'

const GROUPS = [
  { key: 'shortage', title: 'Stock shortage', eyebrow: 'Unserved demand against stock on hand' },
  { key: 'diversion', title: 'Reconciliation gaps', eyebrow: 'Received against issued and held' },
  { key: 'anomaly', title: 'Transaction anomalies', eyebrow: 'Patterns in device records' },
]

export default function Gaps() {
  const { officer } = useSession()
  const gaps = officer.gaps
  if (!gaps) return <p className="font-mono text-xs text-ink-soft">Computing signals…</p>

  const empty = GROUPS.every((g) => (gaps[g.key] ?? []).length === 0)

  return (
    <>
      <PageHeader
        eyebrow="Oversight"
        title="Shortage & anomalies"
        lede="Each signal is derived from shops' own records, so it names a shop and a device rather than a suspicion."
      />

      {empty && (
        <Panel>
          <p className="text-sm">
            Nothing flagged across the district right now. Signals appear as stock falls behind
            unserved demand, as receipts stop reconciling, or as devices log unusual patterns.
          </p>
        </Panel>
      )}

      {!empty && (
        <div className="grid gap-5 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <Panel key={g.key} title={g.title} eyebrow={g.eyebrow}>
              {(gaps[g.key] ?? []).length === 0 ? (
                <p className="text-sm text-ink-soft">Nothing flagged.</p>
              ) : (
                gaps[g.key].map((a) => (
                  <Alert key={a.title} title={a.title} tag={a.tag}>
                    {a.body}
                  </Alert>
                ))
              )}
            </Panel>
          ))}
        </div>
      )}

      <Note className="mt-5">
        This is the part that changes behaviour rather than measuring it: a dealer who knows received
        minus issued is reconciled continuously has a much narrower window to divert stock.
      </Note>
    </>
  )
}
