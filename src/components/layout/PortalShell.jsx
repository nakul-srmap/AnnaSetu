import SideNav from './SideNav'
import { useSession } from '../../app/SessionContext'
import { ROLE_LABELS } from '../../data/reference'

export default function PortalShell({ accent, subtitle, children }) {
  const { role, account } = useSession()
  const assisted = role === 'beneficiary' && account?.assistance

  return (
    <div className={assisted ? 'text-[16px] leading-relaxed' : ''}>
      <div className={`h-1 bg-brand-${accent}`} aria-hidden />

      <div className="border-b border-ink-rule bg-paper-light">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-2.5">
          <p className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
            <span className={`h-2 w-2 rounded-full bg-brand-${accent}`} aria-hidden />
            {ROLE_LABELS[role]}
            <span className="text-ink-rule">/</span>
            {subtitle}
          </p>
          {assisted && (
            <p className="rounded bg-brand-green/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-brand-green">
              Assisted access · larger type, home delivery verified
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-6 py-7 lg:grid-cols-[236px_minmax(0,1fr)]">
        <SideNav accent={accent} subtitle={subtitle} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
