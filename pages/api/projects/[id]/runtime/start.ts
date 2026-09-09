import type { NextApiRequest, NextApiResponse } from 'next'
import { runtimeAccess, runtimeStatusFor, canRun, sanitizedLogs, publicRuntimeError } from '../../../../../lib/runtime/access'
import { buildManifest } from '../../../../../lib/runtime/manifest'
import { detectProject } from '../../../../../lib/runtime/projectDetection'
import { createE2bRuntime } from '../../../../../lib/runtime/e2bProvider'

const activeStatuses = ['creating', 'syncing_files', 'installing', 'starting', 'running']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let runtimeId: string | null = null
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!id) return res.status(400).json({ error: 'Missing project id' })
    const { db, user, workspace, member } = await runtimeAccess(req, id)
    if (!canRun(member)) return res.status(403).json({ error: 'Read-only access' })
    const { data: active, error: activeError } = await db.from('workspace_runtimes').select('*').eq('workspace_id', workspace.id).in('status', activeStatuses).order('created_at', { ascending: false }).maybeSingle()
    if (activeError) throw activeError
    if (active) return res.status(200).json({ runtime: active, existing: true })

    await new Promise((resolve) => setTimeout(resolve, 1800))
    const { data: nodes, error: nodesError } = await db.from('workspace_nodes').select('id,parent_id,name,node_type,content').eq('workspace_id', workspace.id)
    if (nodesError) throw nodesError
    const manifest = buildManifest(nodes || [])
    const project = detectProject(manifest.files)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const { data: created, error: createError } = await db.from('workspace_runtimes').insert({ workspace_id: workspace.id, project_group_id: id, provider: 'e2b', status: 'creating', project_kind: project.kind, created_by: user.id, expires_at: expiresAt, source_snapshot_hash: manifest.snapshotHash }).select('*').single()
    if (createError) {
      const { data: concurrent } = await db.from('workspace_runtimes').select('*').eq('workspace_id', workspace.id).in('status', activeStatuses).order('created_at', { ascending: false }).maybeSingle()
      if (concurrent) return res.status(200).json({ runtime: concurrent, existing: true })
      throw createError
    }
    runtimeId = created.id
    const updateStatus = async (status: 'syncing_files' | 'installing' | 'starting') => {
      const { error } = await db.from('workspace_runtimes').update({ status, last_activity_at: new Date().toISOString() }).eq('id', created.id).eq('workspace_id', workspace.id)
      if (error) throw error
    }
    const provider = await createE2bRuntime(manifest, project, updateStatus)
    const { data: runtime, error: updateError } = await db.from('workspace_runtimes').update({ status: 'running', provider_runtime_id: provider.providerRuntimeId, preview_url: provider.previewUrl, log_tail: sanitizedLogs(provider.logs), started_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', created.id).eq('workspace_id', workspace.id).select('*').single()
    if (updateError) throw updateError
    return res.status(201).json({ runtime })
  } catch (error) {
    const message = publicRuntimeError(error)
    if (runtimeId) {
      try {
        const id = typeof req.query.id === 'string' ? req.query.id : ''
        const { db, workspace } = await runtimeAccess(req, id)
        await db.from('workspace_runtimes').update({ status: 'failed', error_summary: message.slice(0, 500), stopped_at: new Date().toISOString() }).eq('id', runtimeId).eq('workspace_id', workspace.id)
      } catch {}
    }
    return res.status(runtimeStatusFor(error)).json({ error: message.slice(0, 500) })
  }
}
