export default function Panel({ title, eyebrow, action, children, className = '', bodyClass = '' }) {
  return (
    <section className={`border border-ink-rule bg-white ${className}`}>
      {(title || eyebrow || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-ink-rule px-5 py-3.5">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            {title && <h3 className="font-display text-base font-bold tracking-tight">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      <div className={`px-5 py-4 ${bodyClass}`}>{children}</div>
    </section>
  )
}
