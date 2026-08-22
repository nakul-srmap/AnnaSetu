export default function Alert({ title, tag, children, tone = 'warn' }) {
  const edge = tone === 'warn' ? 'border-l-brand-stamp' : 'border-l-brand-orange'
  return (
    <article className={`mb-2.5 border border-ink-rule border-l-[3px] ${edge} bg-white px-4 py-3`}>
      <header className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {tag && (
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.06em] text-brand-stamp">
            {tag}
          </span>
        )}
      </header>
      {children && <p className="mt-1 text-[13px] text-ink-soft">{children}</p>}
    </article>
  )
}
