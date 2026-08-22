import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config, isProduction } from './config.js'
import { authenticate } from './auth/middleware.js'
import authRoutes from './routes/auth.js'
import beneficiaryRoutes from './routes/beneficiary.js'
import dealerRoutes from './routes/dealer.js'
import officerRoutes from './routes/officer.js'
import helplineRoutes from './routes/helpline.js'

export function createApp({ logging = !isProduction } = {}) {
  const app = express()

  app.use(cors({ origin: config.origin }))
  app.use(express.json({ limit: '256kb' }))
  if (logging) app.use(morgan('dev'))
  app.use(authenticate)

  app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }))

  // Unauthenticated: how to reach the system without the app at all.
  app.get('/api/helpline', (_req, res) => res.json(config.helpline))

  app.use('/api/auth', authRoutes)
  app.use('/api/beneficiary', beneficiaryRoutes)
  app.use('/api/dealer', dealerRoutes)
  app.use('/api/officer', officerRoutes)
  app.use('/api/helpline-desk', helplineRoutes)

  // In production the API also serves the built portal, so the whole system is
  // one deployable process on one origin. That removes CORS entirely and means
  // a single URL to hand out. In development Vite serves the portal instead and
  // this directory does not exist, so the block is skipped.
  const dist = path.resolve(fileURLToPath(new URL('../../dist', import.meta.url)))
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }))

    // Anything that is not an API route is a client route, so the app shell is
    // returned and the router decides. Without this a refresh on /token 404s.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }))

  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500
    if (status >= 500) console.error('[error]', err)
    res.status(status).json({ error: status >= 500 ? 'Server error.' : err.message })
  })

  return app
}
