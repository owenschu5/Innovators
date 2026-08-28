import type { NextApiRequest, NextApiResponse } from 'next'

// Placeholder summarize endpoint. Integrate with LLM to return idea summaries.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { ideaId } = req.body
  if (!ideaId) return res.status(400).json({ error: 'Missing ideaId' })

  // Stubbed summary for scaffold
  return res.status(200).json({ summary: 'Summary generation not yet implemented in scaffold.' })
}
