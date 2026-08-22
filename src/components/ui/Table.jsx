export default function Table({ head = [], children, className = '' }) {
  return (
    <table className={`w-full border-collapse text-sm ${className}`}>
      {head.length > 0 && (
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className={`border-b border-ink-rule px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-soft ${
                  h.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {h.label ?? h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>{children}</tbody>
    </table>
  )
}

export function Td({ align, mono, className = '', children, ...props }) {
  return (
    <td
      className={`border-b border-ink-rule px-3 py-2.5 ${align === 'right' ? 'text-right' : ''} ${
        mono ? 'font-mono' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </td>
  )
}
