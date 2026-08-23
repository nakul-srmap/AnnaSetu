import { createApp } from './app.js'
import { config, isProduction } from './config.js'
import { db, initDb } from './db.js'

if (isProduction && config.jwtSecret.includes('development')) {
  console.error('Refusing to start: set JWT_SECRET in production.')
  process.exit(1)
}

// The registers are loaded before the first request, so no route ever has to
// wonder whether storage is ready.
try {
  const { backend } = await initDb()
  console.log(`Storage: ${backend === 'postgres' ? 'PostgreSQL' : `JSON file (${config.dbPath})`}`)
} catch (err) {
  console.error('\nCould not open the database.')
  console.error(`  ${err.message}`)
  console.error('\nCheck that Postgres is running and DATABASE_URL is correct, or unset')
  console.error('DATABASE_URL to fall back to the JSON file.\n')
  process.exit(1)
}

// An empty database on a hosted deployment usually means nobody could run the
// seed by hand — free instances have no shell. Rather than start and reject
// every sign-in, the registers are initialised on first boot. It only runs
// when there are no accounts at all, so a redeploy never wipes live data.
// A database seeded before household PINs existed has beneficiary accounts with
// no credential at all — staff can still sign in, so the registers do not look
// empty and the seed below never runs. Those accounts are given the PIN their
// card number derives, which is what a fresh seed would have set.
if (db.users().length > 0) {
  const missing = db.users().filter((u) => u.role === 'beneficiary' && !u.passwordHash)
  if (missing.length > 0) {
    const { cardPin } = await import('./seed/data.js')
    const { hashPassword } = await import('./auth/passwords.js')
    const { flush } = await import('./db.js')
    db.write((state) => {
      for (const user of state.users) {
        if (user.role === 'beneficiary' && !user.passwordHash) {
          user.passwordHash = hashPassword(cardPin(user.cardNumber ?? user.identifier))
          user.pinSetAt = new Date().toISOString()
        }
      }
    })
    await flush()
    console.log(`Set PINs for ${missing.length} household accounts that had none.`)
  }
}

if (db.users().length === 0) {
  if (config.seedOnEmpty) {
    console.log('No accounts found — seeding the registers…')
    try {
      const { buildSeed } = await import('./seed/data.js')
      const { flush } = await import('./db.js')
      db.replace(buildSeed())
      await flush()
      console.log(`Seeded ${db.users().length} accounts across ${db.shops().length} shops.`)
    } catch (err) {
      console.error(`Automatic seed failed: ${err.message}`)
    }
  } else {
    console.warn('No users found. Run `npm run seed` to initialise the registers.')
  }
}

createApp().listen(config.port, () => {
  console.log(`Anna Setu API on http://localhost:${config.port}`)
})
