import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export const signSession = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl })

export function readSession(token) {
  try {
    return jwt.verify(token, config.jwtSecret)
  } catch {
    return null
  }
}
