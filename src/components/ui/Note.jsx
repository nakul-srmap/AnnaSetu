export default function Note({ children, className = '' }) {
  return (
    <p className={`mt-3 border-l-2 border-ink-rule pl-3 text-xs text-ink-soft ${className}`}>
      {children}
    </p>
  )
}
