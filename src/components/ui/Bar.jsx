export default function Bar({ label, pct, low = 20 }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 bg-ink/10">
        <div
          className={`h-full ${pct < low ? 'bg-brand-stamp' : 'bg-brand-orange'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
