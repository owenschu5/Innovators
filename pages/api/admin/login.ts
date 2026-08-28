import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createAdminSession,
  isAdminConfigured,
  isValidAdminCredentials,
  serializeAdminCookie,
} from '../../../lib/adminAuth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAdminConfigured()) {
    return res.status(500).json({
      error: 'Admin credentials are not configured. Add ADMIN_USERNAME (or ADMIN_EMAIL), ADMIN_PASSWORD, and ADMIN_SESSION_SECRET.',
    })
  }

  const { username, email, password } = req.body as { username?: string; email?: string; password?: string }
  const adminUsername = username || email

  if (!adminUsername || !password) {
    return res.status(400).json({ error: 'Missing username or password' })
  }

  if (!isValidAdminCredentials(adminUsername, password)) {
    return res.status(401).json({ error: 'Invalid admin credentials' })
  }

  const sessionToken = createAdminSession(adminUsername)
  res.setHeader('Set-Cookie', serializeAdminCookie(sessionToken))

  return res.status(200).json({ ok: true, username: adminUsername })
}
