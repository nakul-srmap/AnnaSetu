import { useSession } from './app/SessionContext'
import TopBar from './components/layout/TopBar'
import StatusBar from './components/layout/StatusBar'
import SignIn from './portals/SignIn'
import BeneficiaryPortal from './portals/beneficiary'
import DealerPortal from './portals/dealer'
import OfficerPortal from './portals/officer'
import HelplinePortal from './portals/helpline'

const PORTALS = {
  beneficiary: BeneficiaryPortal,
  dealer: DealerPortal,
  officer: OfficerPortal,
  helpline: HelplinePortal,
}

export default function App() {
  const { role, booting, account } = useSession()
  const Portal = role ? PORTALS[role] : null

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <StatusBar />
      {booting ? (
        <div className="mx-auto w-full max-w-[1400px] px-6 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-ink-soft">
            Restoring your session…
          </p>
        </div>
      ) : Portal ? (
        <Portal />
      ) : (
        <SignIn />
      )}
      <footer className="mt-auto border-t border-ink-rule bg-paper-light">
        <div className="mx-auto max-w-[1400px] px-6 py-4 font-mono text-[11px] tracking-wide text-ink-soft">
          Anna Setu · Department of Consumer Affairs, Food &amp; Civil Supplies
          {account?.district ? ` · ${account.district} district` : ''}
        </div>
      </footer>
    </div>
  )
}
