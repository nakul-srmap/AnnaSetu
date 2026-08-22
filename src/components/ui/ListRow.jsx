export default function ListRow({ title, detail, meta, onClick, disabled, accent = 'green' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      disabled={disabled}
      className={`mb-2 flex w-full items-center justify-between gap-4 rounded border border-ink-rule bg-white px-4 py-3 text-left ${
        onClick && !disabled ? `hover:border-brand-${accent}` : ''
      } ${disabled ? 'opacity-45' : ''}`}
    >
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {detail && <span className="block text-xs text-ink-soft">{detail}</span>}
      </span>
      {meta && (
        <span className={`whitespace-nowrap font-mono text-xs font-semibold text-brand-${accent}`}>
          {meta}
        </span>
      )}
    </Tag>
  )
}
