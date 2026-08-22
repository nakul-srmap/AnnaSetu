const BASE =
  'inline-flex items-center justify-center gap-2 rounded font-body font-semibold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-sm',
}

export default function Button({
  variant = 'solid',
  size = 'md',
  accent = 'green',
  full = false,
  className = '',
  ...props
}) {
  const styles = {
    solid: `bg-brand-${accent} text-white hover:brightness-110`,
    outline: `border border-brand-${accent} text-brand-${accent} bg-white hover:bg-paper-light`,
    quiet: 'border border-ink-rule bg-white text-ink hover:border-ink-soft',
    ghost: 'text-ink-soft hover:text-ink',
  }[variant]

  return (
    <button
      className={`${BASE} ${SIZES[size]} ${styles} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
