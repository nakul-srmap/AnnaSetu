import { useSession } from '../../app/SessionContext'

// Errors from the server, and a quiet indication that the portal is live.
// Without this a rejected issuance would look like a dead button.
export default function StatusBar() {
  const { error, clearError, busy, account, lastSync } = useSession()

  if (error) {
    return (
      <div className="border-b border-brand-stamp/30 bg-brand-stamp/5">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-2">
          <p className="font-mono text-[11px] text-brand-stamp">{error}</p>
          <button
            onClick={clearError}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (!account) return null

  return (
    <div className="border-b border-ink-rule bg-paper-light">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
          {busy ? 'Working…' : 'Live'}
          {lastSync && !busy && ` · updated ${lastSync.toLocaleTimeString('en-IN')}`}
        </p>
        <span
          className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-brand-orange' : 'bg-brand-green'}`}
          aria-hidden
        />
      </div>
    </div>
  )
}
