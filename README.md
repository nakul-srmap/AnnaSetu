# Anna Setu

Public Distribution System for Andhra Pradesh. Households book a collection slot
at a fair price shop near them, dealers serve a known queue and issue against
entitlement, and each district reads what its shops' devices recorded.

React + Vite + Tailwind frontend, Express + Node API.

## Deploying

One Render service serves both the API and the portal. See [DEPLOY.md](DEPLOY.md).

## Database

The API runs on PostgreSQL. Setup, connection strings, the schema and
troubleshooting are in [server/DATABASE.md](server/DATABASE.md).

If `DATABASE_URL` is not set it falls back to a JSON file and needs nothing
installed, which is how the tests run.

## Setup

```bash
npm run setup   # installs both halves and seeds the registers
npm run dev     # Vite on :5173, API on :4000
```

Open http://localhost:5173. The frontend proxies `/api` to the API, so the
browser stays on one origin.

`npm run setup` runs the seed, which creates the district registers: 2 fair price
shops, 3 ration cards and the accounts below. Re-run `npm run seed` to reset.

## Signing in

**Households use a one-time code.** Enter the number printed on the ration card;
the six-digit code is sent to the mobile registered against that card: hashed at rest, valid for 5 minutes, single-use, 5
attempts, 30-second resend cooldown. Requesting a code for an unregistered number
returns the same response as a registered one, so the endpoint cannot be used to
discover who is on the register.

Delivery is pluggable — see **Real SMS** below. By default the code is printed to
the API's terminal and (via `OTP_ECHO`, off in production) shown on the sign-in
screen, so you can sign in without any SMS account.

**Staff use passwords**, scrypt-hashed at seed time.

`npm run seed` prints every account. The register covers 11 households and 5
shops across 3 districts:

| Role | Identifier | Secret |
| --- | --- | --- |
| Household, Mangalagiri (PHH, 5 members) | `28AP-0417-9930` | one-time code |
| Household, Mangalagiri (AAY, senior — assisted) | `28AP-0417-9931` | one-time code |
| Household, Tadepalli (AAY, 78, lives alone — assisted) | `28AP-0512-4430` | one-time code |
| Household, Guntur city (PHH, 6 members) | `28AP-0331-1180` | one-time code |
| Household, Vijayawada (PHH, Krishna district) | `16AP-0904-7712` | one-time code |
| Household, Visakhapatnam (PHH) | `31AP-1120-5561` | one-time code |
| Dealer, FPS 2107 Mangalagiri | `AP/GNT/2107` | `4821` |
| Dealer, FPS 1904 Guntur city | `AP/GNT/1904` | `7702` |
| Dealer, FPS 3312 Vijayawada | `AP/KRI/3312` | `5540` |
| Dealer, FPS 4820 Visakhapatnam | `AP/VSP/4820` | `6127` |
| Officer, Guntur | `JC-GNT-014` | `guntur@2026` |
| Officer, Krishna | `JC-KRI-006` | `krishna@2026` |
| Officer, Visakhapatnam | `JC-VSP-021` | `vizag@2026` |
| Helpline desk | `HD-AP-1967` | `helpline@2026` |

Five more households and one more dealer are seeded; run `npm run seed` to list
them all. The identifier decides which portal opens — there is no portal picker.

## Real SMS

Two things are needed: an account with a gateway, and — for anything beyond
testing — DLT registration, which India's TRAI requires for all commercial SMS
including OTPs.

**Fastest path (minutes, no DLT).** Sign up at fast2sms.com, copy the key from
Dev API, then:

```bash
# server/.env
SMS_PROVIDER=fast2sms
SMS_API_KEY=your-key
```

Verify it before touching the app:

```bash
cd server && node bin/send-test-sms.js 9876543210
```

Their `otp` route delivers as "Your OTP: 123456" from a random numeric sender and
does not need a DLT template. Good enough to demo on a real phone; not a
long-term arrangement.

**Production path (DLT).** To send from your own sender ID with your own wording
you must register on a DLT portal (Jio, Airtel, Vi/vilpower, BSNL — one covers
all operators): entity registration is roughly ₹5,000–5,900 one-time plus GST and
needs a legal entity with PAN/GST KYC, then a 6-character transactional header,
then your exact message template. Approvals typically take a few days. Register
the OTP template as **Service Implicit / transactional** — that category reaches
DND numbers, which promotional does not.

Once approved, add:

```bash
SMS_SENDER_ID=ANASTU
SMS_TEMPLATE_ID=your-approved-template-id
```

The adapter switches to the DLT route on its own. Nothing else changes.

**If you have no legal entity yet** — a student team, for instance — the
non-DLT OTP route above is the practical option, and WhatsApp OTP is outside DLT
scope entirely if you would rather go that way.

Turn off `OTP_ECHO` once real SMS is working, so codes stop appearing on screen.

## Home delivery is verified, not assumed

Delivery to the door is a rationed service — capacity at a shop is small — so it
is unavailable until a district officer verifies an application. Eligibility is a
**status with an expiry**, not a flag on a card:

| Status | What the household sees | Delivery |
| --- | --- | --- |
| `none` | An application form and the grounds that qualify | no |
| `pending` | "Under review", with what they submitted | no |
| `verified` | The request form, plus their review date | **yes** |
| `rejected` | The officer's written reason, and the option to reapply | no |
| `expired` | "Your verification has lapsed", and the option to renew | no |

Grounds: a member aged 60+, a disability certificate, a temporary medical
exemption, or a sole member unable to travel. Each names the document the officer
checks against.

**The household applies** from the delivery section — the section is always
visible, because someone who needs the service has to be able to find out how to
get it. Applying does not switch anything on.

**The officer decides** under *Assistance applications*. Approving grants twelve
months; refusing **requires a written reason**, rejected by the API otherwise,
because the household reads it and has to be able to act on it. Officers can only
decide on cards in their own district.

**Verification lapses on its own.** `assistanceState()` computes `expired` from
the review date at read time, so delivery stops without any scheduled job, and
the household is told it needs renewing rather than finding a dead button.

Seeded across all states: Padma Rani B. verified, Sarojini B. pending, Kanaka
Durga T. lapsed, everyone else unapplied.

## Offline booking — the helpline

A portal that assumes a smartphone excludes exactly the households the PDS exists
for, so booking has a second channel that is a real part of the system rather
than a phone number printed on a page.

**For households:** call **1967** (free, 7 AM – 9 PM, Telugu/Hindi/English) or SMS
`RATION` to `51969`. The number is shown on the sign-in page before anyone
authenticates, since someone who cannot use the app must not have to use the app
to find out how to avoid it.

**For operators:** sign in as `HD-AP-1967` to get a desk built for having someone
on the line — search by the number they are calling from or the number on the
card, read the entitlement out, read the open slots, book, then read back wording
the screen supplies (`Token 003, at FPS 1904, between 10:00 – 10:30. Carry the
ration card.`). A caller ringing back is found under **Today's bookings**.

The important property: a phone booking is an **ordinary booking**. Same token
series, same slot capacity, same rules — double-booking and cycle limits apply
identically — so the shop serves one queue and nobody is treated differently for
not owning a phone. `domain/booking.js` holds those rules precisely so the app
and the helpline cannot drift apart.

Every booking records how it arrived. The dealer's queue shows *booked by phone*,
and the officer's console reports the split across channels. That number is the
point: if the offline share falls toward zero, the helpline is not reaching the
households that need it — it is not evidence that everyone has a smartphone.

Configure with `HELPLINE_NUMBER`, `HELPLINE_SMS_KEYWORD`, `HELPLINE_SMS_SHORTCODE`,
`HELPLINE_HOURS` and `HELPLINE_LANGUAGES`.

## Location

Nothing is pinned to one district. On the booking screen, **Find shops near me**
asks the browser for a position and ranks every shop by real distance, naming the
district and mandal it resolved to. There is no geocoding service involved: the
position is resolved against the shop register itself, so the nearest shop tells
us where you are.

If permission is refused or unavailable, the portal says so and falls back to the
district on the ration card. The header and footer name the district from the
signed-in account, and an officer sees only their own district's shops, cards,
grievances and anomalies.

## The booking flow

Sign in as `28AP-0417-9930`, book a slot at FPS 2107, and a sequential token is
issued with a scannable QR (`ANNASETU:<token>:<card>:<shop>`).

In a second browser, sign in as `AP/GNT/2107` and open **Serve the queue**. The
booking appears there within a few seconds without a reload, and the token can be
scanned immediately — by camera from the household's screen, or keyed in by hand.

Scan → confirm the card → weigh and issue. Stock deducts, the booking is marked
served, the household's portal flips to collected on its own, and the officer's
figures include the transaction.

### How the live update works

The dealer's portal polls `GET /api/dealer` every 4 seconds and refreshes
immediately when the window regains focus, which is the common case of switching
between two windows during a handover. Polling pauses only when the tab is
genuinely hidden. That is why a booking made on another device shows up without
anyone pressing refresh.

## Rules enforced by the API

The UI hiding a control is presentation; these are the actual controls:

- **Role isolation** — a household token gets 403 on `/api/dealer` and
  `/api/officer`, and its payload contains no other card, shop stock or district total.
- **Entitlement ceiling** — PHH is 5 kg of rice per member, AAY a flat 35 kg.
  Issuing more than the card is due, or more than the shop holds, is 422.
- **One collection per cycle** — a served card cannot book or collect again until
  the next calendar month.
- **Slot capacity** — a full slot is 409; a card may hold only one open booking.
- **Token integrity** — tokens are sequential *per shop*, so `T-001` exists at
  every shop. A QR carries the shop and card it was issued for, and a token
  issued elsewhere is refused rather than matched to a local booking with the
  same number.
- **Assistance** — home delivery requires a senior or disabled member recorded on
  the card, checked server-side.
- **One-time codes** — hashed at rest, expiring, single-use, attempt-limited, and
  superseded by a newer request. Verification is constant-time.
- **District scoping** — an officer's queries are filtered to their own district
  by their account, not by a parameter the client could change.

## Structure

```
src/
  App.jsx                      role → portal
  api/client.js                fetch wrapper; session in sessionStorage
  app/SessionContext.jsx       session, server data, polling
  hooks/useGeolocation.js      browser position with permission states
  data/reference.js            navigation and labels only
  components/
    RationCard.jsx  QrCode.jsx  QrScanner.jsx
    layout/  TopBar StatusBar SideNav PageHeader PortalShell
    ui/      Button Field Panel Stat Table Pill Alert ListRow Bar Stepper Note
  portals/
    SignIn.jsx
    beneficiary/  Overview Entitlement BookSlot MyToken Household HomeDelivery Grievance
    dealer/       Overview ShopProfile ServeQueue Inventory Deliveries
    officer/      Masters Assistance Monitoring Gaps Grievances
    helpline/     Lookup Recent

server/src/
  config.js  db.js  app.js  index.js
  auth/      passwords (scrypt) tokens (JWT) middleware (role guards)
  delivery/  sms (gateway or log transport)
  domain/    cycle entitlement slots booking issuance assistance otp geo
  routes/    auth beneficiary dealer officer helpline
  seed/      data run
```

Nothing factual lives in the frontend: entitlement, availability, queues, stock
and district figures all come from the API.

## Tests

```bash
npm test    # 76 API tests
```

Covering OTP issuance, expiry, reuse, attempt limits and resend cooldown; role
isolation; distance ranking and district resolution from coordinates; officer
district scoping; slot capacity and double-booking; per-shop token sequencing and
cross-shop scan refusal; entitlement ceilings for both schemes;
one-collection-per-cycle; and assistance gating.

Assistance verification is covered end to end: applying does not grant delivery,
a refusal without a reason is rejected, only a district's own officer can decide,
approval unlocks the service and nothing else does, and a lapsed verification
blocks it again without intervention.

Offline booking has its own coverage: role isolation for operators, card lookup
by mobile or card number, the read-back payload, phone bookings obeying the same
double-booking and cycle rules, and the channel appearing in the dealer queue and
the officer's split.

The React app was additionally driven against a live API (27 checks): signing in
with a real one-time code including a wrong-code refusal and single-use
enforcement, shop ranking following a simulated device position across three
districts, graceful fallback when location permission is refused, a booking made
elsewhere appearing in the dealer's queue with no reload, and an officer seeing
only their own district.

## Notes for deployment

- Set `JWT_SECRET`; the server refuses to start in production with the default.
- State is a JSON file (`server/data/db.json`) via `db.js`. Every route goes
  through the collection accessors there, which is the seam to swap in Postgres.
- `SLOT_CAPACITY` (default 8) and `CORS_ORIGIN` are environment settings.
