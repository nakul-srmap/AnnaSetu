import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'annasetu-development-secret-change-me',
  jwtTtl: process.env.JWT_TTL ?? '8h',
  // Set this and the API runs on Postgres. Unset, it uses the JSON file below,
  // which is what the test suite runs on.
  databaseUrl: process.env.DATABASE_URL ?? null,
  seedOnEmpty: process.env.SEED_ON_EMPTY !== '0',
  dbPath: process.env.DB_PATH ?? path.join(here, '..', 'data', 'db.json'),
  origin: process.env.CORS_ORIGIN ?? true,
  // Slot capacity is a policy knob, not a constant buried in code.
  slotCapacity: Number(process.env.SLOT_CAPACITY ?? 8),

  // One-time codes for beneficiary sign-in.
  // Returning the code in the API response is a development convenience so the
  // portal can show it on screen. Never enable this in production.

  // The offline access channel, surfaced everywhere the app is offered.
  helpline: {
    number: process.env.HELPLINE_NUMBER ?? '1967',
    smsKeyword: process.env.HELPLINE_SMS_KEYWORD ?? 'RATION',
    smsShortcode: process.env.HELPLINE_SMS_SHORTCODE ?? '51969',
    hours: process.env.HELPLINE_HOURS ?? '7 AM – 9 PM, all days',
    languages: (process.env.HELPLINE_LANGUAGES ?? 'Telugu,Hindi,English').split(','),
  },

}

export const isProduction = process.env.NODE_ENV === 'production'
