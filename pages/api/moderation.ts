import type { NextApiRequest, NextApiResponse } from 'next'

// Placeholder moderation endpoint. Integrate with an AI provider here.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'Missing text' })

  // Stubbed response: always return not_flagged
  return res.status(200).json({ flagged: false, reasons: [] })
}
