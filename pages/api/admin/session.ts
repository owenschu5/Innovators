import type { NextApiRequest, NextApiResponse } from 'next'
import { getAdminSessionFromRequest } from '../../../lib/adminAuth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getAdminSessionFromRequest(req)

  if (!session) {
    return res.status(401).json({ authenticated: false })
  }

  return res.status(200).json({ authenticated: true, email: session.email })
}
