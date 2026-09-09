import type { NextApiRequest, NextApiResponse } from 'next'
import { runtimeAccess, runtimeStatusFor } from '../../../../../lib/runtime/access'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    const { db, workspace } = await runtimeAccess(req, id)
    const { data, error } = await db.from('workspace_runtimes').select('*').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return res.status(200).json({ runtime: data || null })
  } catch (error) {
    return res.status(runtimeStatusFor(error)).json({ error: error instanceof Error ? error.message : 'Runtime operation failed' })
  }
}
