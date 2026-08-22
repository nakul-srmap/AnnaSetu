import { useSession } from '../../app/SessionContext'
import PortalShell from '../../components/layout/PortalShell'
import Overview from './Overview'
import ShopProfile from './ShopProfile'
import ServeQueue from './ServeQueue'
import Inventory from './Inventory'
import Deliveries from './Deliveries'
import CounterBooking from './CounterBooking'
import Receiving from './Receiving'

const VIEWS = {
  overview: Overview,
  profile: ShopProfile,
  serve: ServeQueue,
  inventory: Inventory,
  counter: CounterBooking,
  receiving: Receiving,
  deliveries: Deliveries,
}

export default function DealerPortal() {
  const { view, data, account } = useSession()
  const View = VIEWS[view] ?? Overview

  return (
    <PortalShell
      accent="navy"
      subtitle={data ? `${data.shop.code} · ${data.shop.dealer}` : account.name}
    >
      {data ? <View /> : <p className="font-mono text-xs text-ink-soft">Loading shop…</p>}
    </PortalShell>
  )
}
