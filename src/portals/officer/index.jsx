import { useSession } from '../../app/SessionContext'
import PortalShell from '../../components/layout/PortalShell'
import Masters from './Masters'
import Monitoring from './Monitoring'
import Gaps from './Gaps'
import Grievances from './Grievances'
import Assistance from './Assistance'

const VIEWS = {
  masters: Masters,
  assistance: Assistance,
  monitoring: Monitoring,
  gaps: Gaps,
  grievances: Grievances,
}

export default function OfficerPortal() {
  const { view, account } = useSession()
  const View = VIEWS[view] ?? Monitoring

  return (
    <PortalShell accent="orange" subtitle={`${account.identifier} · ${account.district} district`}>
      <View />
    </PortalShell>
  )
}
