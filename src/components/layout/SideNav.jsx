import { useSession } from '../../app/SessionContext'
import { NAV } from '../../data/reference'

export default function SideNav({ accent, subtitle }) {
  const { role, view, setView, account } = useSession()

  const groups = NAV[role]
    .map((g) => ({
      ...g,
      // Sections can require a card attribute — home delivery needs assistance.
      items: g.items.filter(
        (i) =>
          (!i.requires || account?.[i.requires]) &&
          (!i.requiresNot || !account?.[i.requiresNot]),
      ),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <aside className="border border-ink-rule bg-paper-light">
      <div className="border-b border-ink-rule px-5 py-4">
        <p className="eyebrow">Signed in</p>
        <p className="mt-1 font-display text-sm font-bold leading-snug">{subtitle}</p>
      </div>
      <nav className="px-3 py-4">
        {groups.map((g) => (
          <div key={g.section} className="mb-4 last:mb-0">
            <p className="mb-1.5 flex items-baseline gap-2 px-2">
              <span className="font-mono text-[10px] text-ink-soft">{g.n}</span>
              <span className="eyebrow">{g.section}</span>
            </p>
            <ul>
              {g.items.map((item) => {
                const active = item.id === view
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setView(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full rounded px-2 py-1.5 text-left text-[13px] ${
                        active
                          ? `border-l-2 bg-white font-semibold border-brand-${accent} text-brand-${accent}`
                          : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
