# Database setup

The API keeps every register — cards, shops, bookings, transactions,
grievances, indents — in PostgreSQL.

If `DATABASE_URL` is not set, it falls back to a JSON file at
`server/data/db.json` and needs nothing installed. That fallback is what the
test suite uses. Everything below is for running on Postgres.

---

## 1. Get a Postgres running

Pick **one**.

### Option A — Docker (easiest, nothing to configure)

From the project root:

    docker compose up -d

That starts Postgres 16 with the user, password and database already created.
Check it is ready:

    docker compose ps

Your connection string is:

    postgres://annasetu:annasetu@localhost:5432/annasetu

### Option B — Install Postgres directly

**macOS**

    brew install postgresql@16
    brew services start postgresql@16

**Ubuntu / Debian / WSL**

    sudo apt update
    sudo apt install postgresql postgresql-contrib
    sudo service postgresql start

**Windows** — download the installer from
<https://www.postgresql.org/download/windows/>. Accept the defaults, and note
the password you set for the `postgres` user. Use the included pgAdmin or the
"SQL Shell (psql)" entry in the Start menu for the next step.

Then create the user and database. On macOS:

    psql postgres -c "CREATE USER annasetu WITH PASSWORD 'annasetu';"
    psql postgres -c "CREATE DATABASE annasetu OWNER annasetu;"

On Ubuntu/WSL:

    sudo -u postgres psql -c "CREATE USER annasetu WITH PASSWORD 'annasetu';"
    sudo -u postgres psql -c "CREATE DATABASE annasetu OWNER annasetu;"

On Windows, in SQL Shell (psql), logged in as `postgres`:

    CREATE USER annasetu WITH PASSWORD 'annasetu';
    CREATE DATABASE annasetu OWNER annasetu;

### Option C — A hosted database (no install)

Neon, Supabase and Render all have a free tier. Create a database, copy the
connection string they give you, and add this line to `server/.env`:

    PGSSLMODE=require

Managed providers require TLS; without that line the connection is refused.

---

## 2. Point the API at it

    cd server
    cp .env.example .env

Open `server/.env` and set:

    DATABASE_URL=postgres://annasetu:annasetu@localhost:5432/annasetu

Substitute the hosted connection string here if you chose Option C.

## 3. Install and check

    npm install
    npm run db:check

`db:check` connects, creates the tables if they are missing, and prints a row
count per table. If it fails it names the likely cause. Nothing else runs until
this passes.

## 4. Load the registers

    npm run seed

This is destructive: it clears every table and writes the demo shops, cards and
accounts, printing the sign-in credentials when it finishes.

## 5. Run

    npm run dev          # in server/
    npm run dev          # in the project root, for the portal

The server prints `Storage: PostgreSQL` at startup. If it prints
`Storage: JSON file`, `DATABASE_URL` is not reaching it — see below.

---

## The schema

Ten tables, created automatically on first connection. Each has a `row_key`
primary key, real columns for the fields the portals query, and an `attrs`
JSONB column holding nested values such as a shop's stock levels or a
household's member list.

| Table | Holds |
| --- | --- |
| `users` | Sign-in accounts for all four roles |
| `cards` | Ration cards, their household and their shop |
| `shops` | Fair price shops, stock and opening receipts |
| `bookings` | Slot tokens, with the QR secret |
| `transactions` | Every issue the device recorded |
| `grievances` | Complaints and their stage |
| `deliveries` | Home delivery requests |
| `indents` | Stock requests from shops to the district |
| `scan_exceptions` | Manual token entries, a diversion signal |
| `otps` | One-time sign-in codes, hashed |

Dates and timestamps are stored as text holding ISO 8601. The application
compares them as strings throughout, ISO 8601 sorts correctly as text, and it
avoids timezone conversion on the way in and out. Numbers, booleans and nested
objects use real Postgres types.

Look at the data directly:

    psql postgres://annasetu:annasetu@localhost:5432/annasetu

    \dt                                          -- list tables
    SELECT token, card_number, shop, slot, status FROM bookings ORDER BY token;
    SELECT code, name, attrs->'stock' FROM shops;
    SELECT id, shop, commodity, quantity, status FROM indents;

With Docker, use `docker compose exec db psql -U annasetu -d annasetu` instead.

## How it works

The register set is small — a district of shops and cards, and a day of
bookings — so the API loads it into memory at startup and writes through to
Postgres on every change. Each write computes what actually changed and sends
only those rows, inside a transaction.

This keeps every route and every domain rule synchronous, which is what the
rest of the codebase is built on. The trade-off is that it assumes a single
API process; running two would need reads to go to the database instead. The
accessors in `src/db.js` are the seam where that change would happen.

## Running the tests against Postgres

The default `npm test` uses the JSON file, so it needs no database. To run the
same suite against Postgres, create a second database:

    sudo -u postgres psql -c "CREATE DATABASE annasetu_test OWNER annasetu;"

Then:

    TEST_DATABASE_URL=postgres://annasetu:annasetu@localhost:5432/annasetu_test npm run test:pg

Use a separate database. The suite wipes it on every run.

---

## When something goes wrong

Run `npm run db:check` first — it names the cause for most of these.

**`Storage: JSON file` when you expected Postgres**
`DATABASE_URL` is not reaching the process. It must be in `server/.env`, not
the project root, and the line must not be commented out.

**`ECONNREFUSED`**
Nothing is listening. Start Postgres: `docker compose up -d`, or
`brew services start postgresql@16`, or `sudo service postgresql start`.

**`database "annasetu" does not exist`**
Step 1 was skipped or run against a different server. Create it, then
`npm run seed`.

**`password authentication failed`**
The password in `DATABASE_URL` does not match the one the user was created
with. Reset it:
`sudo -u postgres psql -c "ALTER USER annasetu WITH PASSWORD 'annasetu';"`

**`no pg_hba.conf entry` / `SSL required`**
A hosted provider. Add `PGSSLMODE=require` to `server/.env`.

**Port 5432 already in use**
Something else is already running Postgres. Either use it, or change the host
port in `docker-compose.yml` to `5433:5432` and update the port in
`DATABASE_URL` to match.

**Tables exist but everything is empty**
`npm run seed`.

**The demo behaves oddly after a lot of clicking**
`npm run db:reset` clears the tables and reloads the registers.
