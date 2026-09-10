import type { NextApiRequest, NextApiResponse } from 'next'
import { runtimeAccess, runtimeStatusFor, canRun, sanitizedLogs, publicRuntimeError } from '../../../../../lib/runtime/access'
import { buildManifest } from '../../../../../lib/runtime/manifest'
import { detectProject } from '../../../../../lib/runtime/projectDetection'
import { assertE2bConfigured, createE2bRuntime, RuntimeProviderError, type RuntimeStartStage } from '../../../../../lib/runtime/e2bProvider'

const activeStatuses = ['creating', 'syncing_files', 'installing', 'starting', 'running']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let runtimeId: string | null = null
  let db: any = null
  let workspaceId: string | null = null
  let stage: RuntimeStartStage | 'authorize' | 'database update' = 'authorize'
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!id) return res.status(400).json({ error: 'Missing project id' })
    const access = await runtimeAccess(req, id)
    db = access.db
    workspaceId = access.workspace.id
    const { user, workspace, member } = access
    if (!canRun(member)) return res.status(403).json({ error: 'Read-only access' })
    if (!process.env.E2B_API_KEY) {
      console.error('[runtime:start] E2B_API_KEY missing')
      return res.status(503).json({ error: 'Runtime previews are not configured. Set E2B_API_KEY on the trusted application server.' })
    }
    assertE2bConfigured()
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
    const provider = await createE2bRuntime(manifest, project, async (status) => {
      stage = status === 'syncing_files' ? 'upload files' : status === 'installing' ? 'install dependencies' : 'start server'
      await updateStatus(status)
    })
    stage = 'database update'
    const { data: runtime, error: updateError } = await db.from('workspace_runtimes').update({ status: 'running', provider_runtime_id: provider.providerRuntimeId, preview_url: provider.previewUrl, log_tail: sanitizedLogs(provider.logs), started_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', created.id).eq('workspace_id', workspace.id).select('*').single()
    if (updateError) throw updateError
    return res.status(201).json({ runtime })
  } catch (error) {
    const message = publicRuntimeError(error)
    const providerError = error instanceof RuntimeProviderError ? error : null
    console.error('[runtime:start] failed', {
      stage: providerError?.stage || stage,
      name: error instanceof Error ? error.name : 'Error',
      message: sanitizeDiagnostic(error instanceof Error ? error.message : 'Runtime operation failed'),
      code: providerError?.code,
      status: providerError?.status,
    })
    if (runtimeId && db && workspaceId) {
      try {
        await db.from('workspace_runtimes').update({ status: 'failed', error_summary: message.slice(0, 500), stopped_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', runtimeId).eq('workspace_id', workspaceId)
      } catch (updateError) {
        console.error('[runtime:start] failed to mark runtime failed', { name: updateError instanceof Error ? updateError.name : 'Error', message: sanitizeDiagnostic(updateError instanceof Error ? updateError.message : 'Database update failed') })
      }
    }
    return res.status(runtimeStatusFor(error)).json({ error: message.slice(0, 500) })
  }
}

function sanitizeDiagnostic(value: string) {
  return sanitizedLogs(value).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\b(?:e2b|sk)_[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 1000)
}
