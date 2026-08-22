import { useSession } from '../../app/SessionContext'
import PortalShell from '../../components/layout/PortalShell'
import Lookup from './Lookup'
import Recent from './Recent'

const VIEWS = { lookup: Lookup, recent: Recent }

export default function HelplinePortal() {
  const { view, account } = useSession()
  const View = VIEWS[view] ?? Lookup

  return (
    <PortalShell accent="stamp" subtitle={account.name}>
      <View />
    </PortalShell>
  )
}
