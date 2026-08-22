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
