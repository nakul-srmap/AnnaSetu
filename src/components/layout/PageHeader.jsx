export default function PageHeader({ eyebrow, title, lede, action }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink-rule pb-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        {lede && <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{lede}</p>}
      </div>
      {action}
    </header>
  )
}
