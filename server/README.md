# Anna Setu API

Express + Node. Owns the registers, the domain rules, and every factual number
the portals display.

```bash
npm install
npm run seed    # initialise the registers (destructive)
npm run dev     # http://localhost:4000
npm test        # 36 tests
```

## Endpoints

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/auth/otp/request` | — (households) |
| POST | `/api/auth/otp/verify` | — (households) |
| POST | `/api/auth/login` | — (staff) |
| GET | `/api/auth/me` | any |
| POST | `/api/auth/logout` | any |
| GET | `/api/beneficiary` | beneficiary |
| GET | `/api/beneficiary/shops?lat=&lng=` | beneficiary |
| GET | `/api/beneficiary/shops/:code/slots` | beneficiary |
| POST | `/api/beneficiary/bookings` | beneficiary |
| DELETE | `/api/beneficiary/bookings/:id` | beneficiary |
| POST | `/api/beneficiary/grievances` | beneficiary |
| POST | `/api/beneficiary/assistance` | beneficiary |
| POST | `/api/beneficiary/deliveries` | beneficiary, **verified assistance only** |
| GET | `/api/dealer` | dealer |
| GET | `/api/dealer/queue` | dealer |
| POST | `/api/dealer/scan` | dealer |
| POST | `/api/dealer/transactions` | dealer |
| POST | `/api/dealer/indents` | dealer |
| POST | `/api/dealer/deliveries/:id/assign` | dealer |
| GET | `/api/officer/masters` `/monitoring` `/gaps` `/grievances` | officer |
| GET | `/api/officer/assistance` | officer |
| POST | `/api/officer/assistance/:cardNumber/decision` | officer |
| GET | `/api/helpline` | — (public) |
| GET | `/api/helpline-desk/lookup?q=` | helpline |
| POST | `/api/helpline-desk/bookings` | helpline |
| DELETE | `/api/helpline-desk/bookings/:id` | helpline |
| GET | `/api/helpline-desk/recent` | helpline |
| POST | `/api/officer/grievances/:id/stage` | officer |

`/api/dealer/queue` is the lightweight endpoint the dealer portal polls.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | 4000 | |
| `JWT_SECRET` | development value | Required in production; startup fails otherwise |
| `JWT_TTL` | 8h | |
| `DB_PATH` | `server/data/db.json` | |
| `DB_NO_PERSIST` | — | `1` keeps state in memory (used by tests) |
| `SLOT_CAPACITY` | 8 | Cards per slot |
| `HELPLINE_NUMBER` | 1967 | Shown publicly |
| `HELPLINE_SMS_KEYWORD` / `HELPLINE_SMS_SHORTCODE` | RATION / 51969 | SMS route |
| `HELPLINE_HOURS` / `HELPLINE_LANGUAGES` | 7 AM – 9 PM / Telugu,Hindi,English | Shown publicly |
| `CORS_ORIGIN` | reflect request | Set to the web origin in production |
| `OTP_TTL_MS` | 300000 | Code lifetime |
| `OTP_MAX_ATTEMPTS` | 5 | Wrong tries before a new code is needed |
| `OTP_RESEND_COOLDOWN_MS` | 30000 | Anti-spam on resend |
| `OTP_ECHO` | on outside production | Returns the code in the response for local use |
| `SMS_PROVIDER` | `log` | `log`, `fast2sms`, or `generic` |
| `SMS_API_KEY` | — | Gateway key |
| `SMS_SENDER_ID` | — | DLT-approved 6-char header, once registered |
| `SMS_TEMPLATE_ID` | — | DLT template id, once registered |
| `SMS_PROVIDER_URL` | — | Endpoint for `generic` |

## One-time codes

`domain/otp.js` holds the challenge logic: codes are SHA-256 hashed with the
server secret, expire after `OTP_TTL_MS`, allow `OTP_MAX_ATTEMPTS` wrong tries,
are consumed on success, and a new request supersedes the previous code.
Verification is constant-time.

`delivery/sms.js` holds three transports, chosen by `SMS_PROVIDER`:

- `log` (default) — prints the code to the API terminal. No account needed.
- `fast2sms` — real SMS. Uses the `otp` route (no DLT template required) until
  `SMS_TEMPLATE_ID` and `SMS_SENDER_ID` are set, then switches to the `dlt` route
  with your approved template.
- `generic` — any other REST gateway via `SMS_PROVIDER_URL`; adjust the body
  mapping in the `generic` provider to match your vendor.

Every transport degrades to the log on failure and says why, so a gateway outage
or an expired key never locks people out. Note that Fast2SMS answers HTTP 200
with `{ return: false }` on failure, so the adapter checks the payload rather
than the status code.

Verify delivery independently of the app:

```bash
node bin/send-test-sms.js 9876543210
```

## Location

`domain/geo.js` computes great-circle distance and resolves a position against
the shop register: the nearest shop supplies the district and mandal, so no
external geocoding service is required. `GET /api/beneficiary/shops` accepts
`lat`/`lng`, validates them, ranks by distance, and reports which source the area
came from (`position` or `card`). Invalid coordinates are ignored rather than
trusted.

## Assistance verification

`domain/assistance.js` owns the states (`none`, `pending`, `verified`,
`rejected`, `expired`) and the transitions. `requireAssistance` admits only
`verified`, and returns the state alongside the error so the client can explain
where the household stands.

`assistanceState()` derives `expired` from the review date whenever a card is
read, so a lapsed verification revokes delivery with no scheduled job. A refusal
without a reason is rejected — the text is shown to the household. Officers may
only decide on cards at shops in their own district.

## Token codes

Each booking carries a `secret` — six random bytes, base64url — and the QR
payload is `ANNASETU:<token>:<card>:<shop>:<secret>`. Two consequences worth
knowing:

- Every booking renders a **different** QR, including the same household
  rebooking after a cancellation. Token numbers restart daily per shop, so
  without the secret the same card at the same shop produced a byte-identical
  code every time.
- A token number is **not** enough to forge a code. `/dealer/scan` rejects a
  scan whose secret does not match the booking (409, "not current"), which also
  catches a stale QR photographed from an earlier booking.

Keying a token in by hand still works when a camera fails — that path skips the
secret check and is recorded as a scan exception on the officer's anomaly list,
so a shop that never scans stands out.

## Booking channels

`domain/booking.js` owns booking creation and cancellation for every channel.
Both `routes/beneficiary.js` and `routes/helpline.js` call it, so a phone booking
cannot end up under looser rules than an app booking. Each row records `channel`
(`app`, `phone`, `sms`, `counter`) and `bookedBy`, which drives the dealer's badge
and the officer's access split.

The helpline desk is a distinct role: operators can look up any card and book for
it, but get 403 on the beneficiary, dealer and officer APIs. They cannot record a
booking as having come from the app.

## Domain notes

- A cycle is a calendar month; entitlement resets on the 1st.
- Tokens are sequential per shop per day and allocated inside the write, so two
  simultaneous bookings cannot receive the same queue number.
- `officer/gaps` computes shortage from unserved demand versus stock on hand,
  reconciliation gaps from opening receipt minus issued minus held, and anomalies
  from manual-entry exceptions. Nothing on that screen is authored.
