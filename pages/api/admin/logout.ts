import type { NextApiRequest, NextApiResponse } from 'next'
import { clearAdminCookie } from '../../../lib/adminAuth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Set-Cookie', clearAdminCookie())
  return res.status(200).json({ ok: true })
}
