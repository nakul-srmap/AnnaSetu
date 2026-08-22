import { useSession } from '../app/SessionContext'

// The card as a physical artifact: the household's identity in this system.
export default function RationCard({ card, compact = false }) {
  const { data } = useSession()
  const c = card ?? data?.card
  if (!c) return null

  return (
    <article className="ruled-paper relative border border-ink/30 bg-stock px-4 pb-3 pt-3.5">
      <header className="flex items-start justify-between gap-4 border-b border-ink/25 pb-2.5">
        <div>
          <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-[#4B4535]">
            Dept. of Consumer Affairs, Food &amp; Civil Supplies
          </p>
          <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight">{c.holder}</h3>
        </div>
        <span className="whitespace-nowrap border border-ink/40 px-2 py-1 font-mono text-[9px]">
          {c.scheme}
        </span>
      </header>

      <p className="mt-2.5 font-mono text-[13px] tracking-[0.14em]">{c.number}</p>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
        {[
          ['Members', c.members],
          ['Linked shop', c.shop],
          // The UID of the tag embedded in the physical card, so a household
          // can read it out if the reader at the counter cannot pick it up.
          ...(c.rfidTag ? [['Card chip', c.rfidTag]] : []),
          ...(compact ? [] : [['Address', c.address]]),
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-[#4B4535]">{k}</dt>
            <dd className="font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>

      {c.assistance?.status === 'verified' && !compact && (
        <p className="mt-3 border-t border-ink/20 pt-2 font-mono text-[9px] uppercase tracking-[0.09em] text-[#4B4535]">
          Assistance verified · {c.assistance.ground}
        </p>
      )}
    </article>
  )
}
