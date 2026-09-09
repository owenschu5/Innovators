import type { NextApiRequest, NextApiResponse } from 'next'
import { runtimeAccess, runtimeStatusFor, canRun } from '../../../../../lib/runtime/access'
import { stopE2bRuntime } from '../../../../../lib/runtime/e2bProvider'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    const { db, workspace, member } = await runtimeAccess(req, id)
    if (!canRun(member)) return res.status(403).json({ error: 'Read-only access' })
    const { data: runtime, error } = await db.from('workspace_runtimes').select('*').eq('workspace_id', workspace.id).in('status', ['creating', 'syncing_files', 'installing', 'starting', 'running']).order('created_at', { ascending: false }).maybeSingle()
    if (error) throw error
    if (!runtime) return res.status(200).json({ runtime: null })
    if (runtime.provider_runtime_id) {
      try { await stopE2bRuntime(runtime.provider_runtime_id) } catch {}
    }
    const { data: stopped, error: updateError } = await db.from('workspace_runtimes').update({ status: 'stopped', stopped_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', runtime.id).eq('workspace_id', workspace.id).select('*').single()
    if (updateError) throw updateError
    return res.status(200).json({ runtime: stopped })
  } catch (error) {
    return res.status(runtimeStatusFor(error)).json({ error: error instanceof Error ? error.message : 'Runtime operation failed' })
  }
}
