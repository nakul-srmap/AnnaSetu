import { useSession } from '../../app/SessionContext'
import PortalShell from '../../components/layout/PortalShell'
import Overview from './Overview'
import Entitlement from './Entitlement'
import BookSlot from './BookSlot'
import MyToken from './MyToken'
import Household from './Household'
import HomeDelivery from './HomeDelivery'
import Grievance from './Grievance'

const VIEWS = {
  overview: Overview,
  entitlement: Entitlement,
  book: BookSlot,
  token: MyToken,
  household: Household,
  delivery: HomeDelivery,
  grievance: Grievance,
}

export default function BeneficiaryPortal() {
  const { view, data, account } = useSession()
  const View = VIEWS[view] ?? Overview

  return (
    <PortalShell
      accent="green"
      subtitle={data ? `${data.card.holder} · ${data.card.number}` : account.name}
    >
      {data ? <View /> : <p className="text-sm text-ink-soft">Loading your card…</p>}
    </PortalShell>
  )
}
