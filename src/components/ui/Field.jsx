export function Label({ children }) {
  return <span className="eyebrow mb-1.5 block">{children}</span>
}

export default function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`mb-4 block ${className}`}>
      <Label>{label}</Label>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}

const CONTROL =
  'w-full rounded border border-ink-rule bg-white px-3 py-2.5 font-mono text-sm text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-stamp'

export function TextInput({ className = '', ...props }) {
  return <input className={`${CONTROL} ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${CONTROL} ${className}`} {...props}>
      {children}
    </select>
  )
}
