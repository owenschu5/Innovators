import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticatedSupabase } from '../../../../lib/supabaseServer'

type WorkspaceMember = {
  permissions?: string | null
}

function canEdit(member: WorkspaceMember) {
  return member.permissions !== 'viewer'
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : 'Workspace operation failed'
  if (message === 'Authentication required') return 401
  if (message.includes('denied') || message.includes('Read-only')) return 403
  if (message.includes('Workspace database tables are missing')) return 503
  if (message.includes('not found') || message.includes('unavailable')) return 404
  if (message.includes('Invalid')) return 400
  return 500
}

function isMissingWorkspaceSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return (
    record.code === 'PGRST205' ||
    record.message?.includes("Could not find the table 'public.project_workspaces'") ||
    record.message?.includes("Could not find the table 'public.workspace_nodes'") ||
    record.message?.includes("Could not find the table 'public.workspace_file_versions'")
  )
}

function cleanName(value: unknown) {
  const name = String(value || '').trim()
  if (!name || !/^[^\\/]+$/.test(name) || name.includes('..')) throw new Error('Invalid file or folder name')
  return name
}

async function access(req: NextApiRequest, id: string) {
  const { db, user } = await authenticatedSupabase(req)

  const { data: project, error: projectError } = await db
    .from('idea_groups')
    .select('id, workspace_active, status, name')
    .eq('id', id)
    .single()
  if (projectError || !project?.workspace_active || project.status !== 'approved') throw new Error('Workspace unavailable')

  const { data: member, error: memberError } = await db
    .from('idea_group_members')
    .select('permissions')
    .eq('group_id', id)
    .eq('user_id', user.id)
    .eq('invitation_status', 'accepted')
    .maybeSingle()
  if (memberError || !member) throw new Error('Workspace access denied')

  const { data: workspace, error: workspaceError } = await db
    .from('project_workspaces')
    .upsert({ project_group_id: id, name: project.name || `Project ${id}` }, { onConflict: 'project_group_id' })
    .select('*')
    .single()
  if (isMissingWorkspaceSchema(workspaceError)) {
    throw new Error('Workspace database tables are missing. Run sql/migrations/20260810_workspace_files.sql in Supabase, then reload the app.')
  }
  if (workspaceError || !workspace) throw new Error(workspaceError?.message || 'Workspace unavailable')

  return { db, user, workspace, member }
}

async function getNode(db: Awaited<ReturnType<typeof authenticatedSupabase>>['db'], nodeId: unknown, workspaceId: string) {
  const { data, error } = await db
    .from('workspace_nodes')
    .select('*')
    .eq('id', String(nodeId || ''))
    .eq('workspace_id', workspaceId)
    .single()
  if (error || !data) throw new Error('File not found')
  return data
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing project id' })

    const { db, user, workspace, member } = await access(req, id)

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('workspace_nodes')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('node_type')
        .order('name')
      if (error) throw error
      return res.status(200).json({ workspace, nodes: data || [] })
    }

    if (req.method === 'POST') {
      if (!canEdit(member)) return res.status(403).json({ error: 'Read-only access' })
      const name = cleanName(req.body.name)
      const nodeType = req.body.node_type
      const parentId = req.body.parent_id || null
      if (!['file', 'folder'].includes(nodeType)) return res.status(400).json({ error: 'Invalid node type' })

      if (parentId) {
        const parent = await getNode(db, parentId, workspace.id)
        if (parent.node_type !== 'folder') return res.status(400).json({ error: 'Invalid parent folder' })
      }

      const { data, error } = await db
        .from('workspace_nodes')
        .insert({
          workspace_id: workspace.id,
          parent_id: parentId,
          name,
          node_type: nodeType,
          content: nodeType === 'file' ? '' : null,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('*')
        .single()
      if (error) throw error
      return res.status(201).json({ node: data })
    }

    const node = await getNode(db, req.body.node_id, workspace.id)

    if (req.method === 'PUT') {
      if (!canEdit(member)) return res.status(403).json({ error: 'Read-only access' })
      if (node.node_type !== 'file') return res.status(400).json({ error: 'Only files can be saved' })
      const content = String(req.body.content ?? '')
      const nextVersion = Number(node.version || 0) + 1
      const { data, error } = await db
        .from('workspace_nodes')
        .update({ content, version: nextVersion, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', node.id)
        .select('*')
        .single()
      if (error) throw error
      await db.from('workspace_file_versions').insert({ node_id: node.id, version: data.version, content, changed_by: user.id, source: 'manual-save' })
      return res.status(200).json({ node: data })
    }

    if (req.method === 'PATCH') {
      if (!canEdit(member)) return res.status(403).json({ error: 'Read-only access' })
      const name = cleanName(req.body.name)
      const { data, error } = await db.from('workspace_nodes').update({ name, updated_by: user.id }).eq('id', node.id).select('*').single()
      if (error) throw error
      return res.status(200).json({ node: data })
    }

    if (req.method === 'DELETE') {
      if (!canEdit(member)) return res.status(403).json({ error: 'Read-only access' })
      const { error } = await db.from('workspace_nodes').delete().eq('id', node.id)
      if (error) throw error
      return res.status(200).json({ deleted: node.id })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workspace operation failed'
    return res.status(statusFor(error)).json({ error: message })
  }
}
