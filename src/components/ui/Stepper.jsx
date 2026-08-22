export default function Stepper({ steps, current, accent = 'green' }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      {steps.map((label, i) => {
        const done = i < current
        const now = i === current
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] ${
                now ? `text-brand-${accent}` : done ? 'text-ink-soft' : 'text-ink-soft/50'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] ${
                  now
                    ? `border-brand-${accent} bg-brand-${accent} text-white`
                    : done
                      ? 'border-ink-soft text-ink-soft'
                      : 'border-ink-rule text-ink-soft/50'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-ink-rule" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
