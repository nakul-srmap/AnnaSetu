import { useSession } from '../../app/SessionContext'
import { ACCENTS, ROLE_LABELS } from '../../data/reference'
import Button from '../ui/Button'

export default function TopBar() {
  const { account, role, signOut } = useSession()
  const place = [account?.mandal, account?.district && `${account.district} district`]
    .filter(Boolean)
    .join(', ')
  const accent = ACCENTS[role] ?? 'green'

  return (
    <header className="gridded border-b border-ink-rule bg-paper-light">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt=""
            aria-hidden
            className="h-11 w-11 shrink-0 object-contain"
          />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="font-display text-3xl font-extrabold tracking-tight">Anna Setu</h1>
            <p className="font-display text-sm text-ink-soft">
              Public Distribution System{place ? ` · ${place}` : ''}
            </p>
          </div>
        </div>

        {account ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-soft">
              <span className={`h-2 w-2 rounded-full bg-brand-${accent}`} aria-hidden />
              {ROLE_LABELS[role]} · {account.name}
            </p>
            <Button variant="quiet" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-soft">
            Sign in with your ration card number, shop licence or ID
          </p>
        )}
      </div>
    </header>
  )
}
