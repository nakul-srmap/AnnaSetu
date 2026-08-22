const TONES = {
  neutral: 'bg-ink/5 text-ink-soft',
  good: 'bg-brand-green/10 text-brand-green',
  warn: 'bg-brand-stamp/10 text-brand-stamp',
  info: 'bg-brand-navy/10 text-brand-navy',
}

export default function Pill({ tone = 'neutral', children }) {
  return (
    <span
      className={`inline-block rounded px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.07em] ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
