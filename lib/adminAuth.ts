import crypto from 'crypto'
import type { NextApiRequest } from 'next'

export const ADMIN_COOKIE_NAME = 'innovators_admin_session'

type AdminSession = {
  email: string
  issuedAt: number
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getAdminSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'change-me'
}

function sign(value: string) {
  return crypto.createHmac('sha256', getAdminSecret()).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Uint8Array.from(Buffer.from(left))
  const rightBuffer = Uint8Array.from(Buffer.from(right))

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function parseCookies(cookieHeader?: string) {
  return (cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separator = part.indexOf('=')
      if (separator === -1) {
        return acc
      }

      const key = part.slice(0, separator)
      const value = decodeURIComponent(part.slice(separator + 1))
      acc[key] = value
      return acc
    }, {})
}

export function createAdminSession(email: string) {
  const payload = base64UrlEncode(
    JSON.stringify({
      email,
      issuedAt: Date.now(),
    } satisfies AdminSession)
  )

  return `${payload}.${sign(payload)}`
}

export function verifyAdminSession(token?: string | null): AdminSession | null {
  if (!token) {
    return null
  }

  const [payload, signature] = token.split('.')

  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return null
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as AdminSession

    if (!decoded.email || !decoded.issuedAt) {
      return null
    }

    return decoded
  } catch {
    return null
  }
}

export function getAdminSessionFromCookieHeader(cookieHeader?: string) {
  const cookies = parseCookies(cookieHeader)
  return verifyAdminSession(cookies[ADMIN_COOKIE_NAME])
}

export function getAdminSessionFromRequest(req: NextApiRequest) {
  return getAdminSessionFromCookieHeader(req.headers.cookie)
}

export function isAdminConfigured() {
  return Boolean((process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL) && process.env.ADMIN_PASSWORD)
}

export function isValidAdminCredentials(username: string, password: string) {
  const configuredUsername = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL
  return (
    isAdminConfigured() &&
    username === configuredUsername &&
    password === process.env.ADMIN_PASSWORD
  )
}

export function serializeAdminCookie(token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`
}

export function clearAdminCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}
