# Deploying to Render

One service. The API serves the built portal from the same process, so there is
one URL, no CORS, and nothing to configure between a frontend and a backend.

Vercel is not used: it runs serverless functions, and this API holds the
registers in memory and writes through to Postgres, which needs one
long-running process. On Vercel that means inconsistent reads and lost writes.

Budget 30 minutes.

## 1. Push to GitHub

Render deploys from a repository.

    git init
    git add -A
    git commit -m "Anna Setu"

Create an empty repo on GitHub, then follow the two commands it shows you.

`.gitignore` already excludes `node_modules`, `.env`, and `server/data`, so no
secrets or local databases are committed.

## 2. Database

On <https://render.com>: **New → Postgres**. Any name, free plan, region close
to you. When it is created, copy the **Internal Database URL**.

Neon (<https://neon.tech>) works equally well if you prefer; copy the
connection string it gives you.

## 3. Web service

**New → Web Service**, connect the repository, then:

| Setting | Value |
| --- | --- |
| Root Directory | *(leave blank — the repository root)* |
| Build Command | `npm run render:build` |
| Start Command | `npm run render:start` |

Add these environment variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the connection string from step 2 |
| `PGSSLMODE` | `require` |
| `JWT_SECRET` | any long random string |
| `NODE_ENV` | `production` |

Households sign in with a card number and a PIN set at the shop, so there is no
SMS gateway to configure and nothing metered to run out of. The seed sets a PIN
for every household and prints them.

`PGSSLMODE=require` is needed by every managed Postgres provider. Without it
the connection is refused.

Deploy. The first build takes a few minutes.

## 4. Seed

Once it is live, open the **Shell** tab on the service and run:

    npm run seed

This is the step people forget. Without it the tables exist but are empty, and
every sign-in is rejected.

## 5. Check

Open the service URL. You should get the sign-in screen. Then:

- `/api/health` returns `{"ok":true,...}`
- Sign in as a dealer: `AP/GNT/2107` / `4821`
- Sign in as a household: card `03PB-0221-1140`, PIN `4368`

The logs should say `Storage: PostgreSQL`. If they say `Storage: JSON file`,
`DATABASE_URL` is not set on the service and the data will vanish on restart.

---

## Before presenting

**Wake the service.** The free plan sleeps after inactivity and the first
request takes about thirty seconds. Open the URL a few minutes before you
present, not while a judge is watching.

**Geolocation needs HTTPS**, which Render provides, so the nearest-shop sorting
works on the deployed URL. It does not work over a plain-HTTP LAN address.

**To reset the demo**, run `npm run seed` again from the Shell tab.

## If something fails

**Build fails on `vite: not found`** — the build command must be
`npm run render:build`, which installs the root and server dependencies before
building.

**Site loads but every API call fails** — the service is running the portal
without the API. Check the start command is `npm run render:start`.

**`no pg_hba.conf entry` or an SSL error** — `PGSSLMODE=require` is missing.

**A household cannot sign in** — the seed has not run on this database, so no
PIN has been set. Run `npm run seed` from the Shell tab; it prints every PIN.

**Everything empties after a redeploy** — `DATABASE_URL` is not set, so it fell
back to a JSON file on a disk that does not survive restarts.
