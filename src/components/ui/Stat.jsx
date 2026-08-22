export default function Stat({ label, value, unit, note, accent = 'orange' }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold leading-none tracking-tight">
        {value}
        {unit && <span className="ml-1 font-body text-sm font-medium text-ink-soft">{unit}</span>}
      </p>
      {note && <p className={`mt-1.5 text-xs text-ink-soft`}>{note}</p>}
    </div>
  )
}

export function StatRow({ children }) {
  return (
    <div className="grid gap-px border border-ink-rule bg-ink-rule sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  )
}
