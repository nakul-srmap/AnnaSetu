import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, KEYLEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

// Constant-time comparison so a wrong password can't be timed character by character.
export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const candidate = scryptSync(String(plain ?? ''), salt, KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}
