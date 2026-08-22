// Static reference data used purely for rendering: navigation structure and
// labels. Everything factual — cards, slots, stock, transactions — comes from
// the API.

export const ACCENTS = {
  beneficiary: 'green',
  dealer: 'navy',
  officer: 'orange',
  helpline: 'stamp',
}

export const ROLE_LABELS = {
  beneficiary: 'Beneficiary',
  dealer: 'Fair price shop',
  officer: 'Civil Supplies officer',
  helpline: 'Helpline desk',
}

export const NAV = {
  beneficiary: [
    { n: '1', section: 'Your card', items: [{ id: 'overview', label: 'Overview' }, { id: 'household', label: 'Household & members' }] },
    {
      n: '2',
      section: 'Ration services',
      items: [
        { id: 'entitlement', label: 'Entitlement & history' },
        { id: 'book', label: 'Book a collection slot' },
        { id: 'token', label: 'My token' },
      ],
    },
    {
      n: '3',
      section: 'Assistance',
      items: [
        // Home delivery only appears on an assisted sign-in. Standard access
        // still needs a way in to apply, so the same screen is offered under a
        // label that does not promise a service the card cannot use yet.
        { id: 'delivery', label: 'Home delivery', requires: 'assistance' },
        { id: 'delivery', label: 'Apply for assistance', requiresNot: 'assistance' },
      ],
    },
    { n: '4', section: 'Support', items: [{ id: 'grievance', label: 'Grievances' }] },
  ],
  dealer: [
    { n: '1', section: 'Shop', items: [{ id: 'overview', label: 'Today at a glance' }, { id: 'profile', label: 'Profile & staff' }] },
    { n: '2', section: 'Distribution', items: [{ id: 'serve', label: 'Serve the queue' }, { id: 'counter', label: 'Book at the counter' }] },
    { n: '3', section: 'Stock', items: [{ id: 'inventory', label: 'Stock & indents' }, { id: 'receiving', label: 'Receive stock' }] },
    { n: '4', section: 'Assistance', items: [{ id: 'deliveries', label: 'Delivery requests' }] },
  ],
  helpline: [
    { n: '1', section: 'Caller', items: [{ id: 'lookup', label: 'Look up a card' }] },
    { n: '2', section: 'Desk', items: [{ id: 'recent', label: "Today's bookings" }] },
  ],
  officer: [
    { n: '1', section: 'Registers', items: [{ id: 'masters', label: 'Cards & shops' }] },
    { n: '2', section: 'Verification', items: [{ id: 'assistance', label: 'Assistance applications' }] },
    { n: '3', section: 'Monitoring', items: [{ id: 'monitoring', label: 'Distribution' }] },
    { n: '4', section: 'Oversight', items: [{ id: 'gaps', label: 'Shortage & anomalies' }] },
    { n: '5', section: 'Control', items: [{ id: 'grievances', label: 'Grievances' }] },
  ],
}

export const HOME_VIEW = {
  beneficiary: 'overview',
  dealer: 'overview',
  officer: 'monitoring',
  helpline: 'lookup',
}

export const ASSISTANCE_STATUS = {
  none: { label: 'not applied', tone: 'neutral' },
  pending: { label: 'under review', tone: 'warn' },
  verified: { label: 'verified', tone: 'good' },
  rejected: { label: 'not approved', tone: 'warn' },
  expired: { label: 'lapsed', tone: 'warn' },
}

export const DELIVERY_WINDOWS = [
  'Tomorrow, 9 AM – 12 PM',
  'Tomorrow, 4 PM – 7 PM',
  'Day after, 9 AM – 12 PM',
]

export const GRIEVANCE_CATEGORIES = [
  'Short weight given',
  'Shop refused to serve the card',
  'Extra money demanded',
  'Shop closed during listed hours',
]

export const DELIVERY_PARTNERS = ['Yesu Babu', 'M. Ravi', 'Ward volunteer']

// How a booking reached the system, for badges in the dealer and officer views.
export const CHANNEL_LABELS = {
  app: 'app',
  phone: 'by phone',
  sms: 'by SMS',
  counter: 'at the shop',
}
