import type { NextApiRequest } from 'next'
import { authenticatedSupabase } from '../supabaseServer'

export async function runtimeAccess(req: NextApiRequest, projectId: string) {
  const { db, user } = await authenticatedSupabase(req)
  const { data: project, error: projectError } = await db.from('idea_groups').select('id, workspace_active, status, name').eq('id', projectId).single()
  if (projectError || !project?.workspace_active || project.status !== 'approved') throw new Error('Workspace unavailable')
  const { data: member, error: memberError } = await db
    .from('idea_group_members').select('permissions').eq('group_id', projectId).eq('user_id', user.id).eq('invitation_status', 'accepted').maybeSingle()
  if (memberError || !member) throw new Error('Workspace access denied')
  const { data: workspace, error: workspaceError } = await db.from('project_workspaces').select('id').eq('project_group_id', projectId).maybeSingle()
  if (workspaceError || !workspace) throw new Error('Workspace unavailable')
  return { db, user, workspace, member }
}

export function canRun(member: { permissions?: string | null }) {
  return member.permissions !== 'viewer'
}

export function runtimeStatusFor(error: unknown) {
  const message = error instanceof Error ? error.message : 'Runtime operation failed'
  if (message === 'Authentication required') return 401
  if (message.includes('denied') || message.includes('Read-only')) return 403
  if (message.includes('unsupported') || message.includes('package.json') || message.includes('limit') || message.includes('Invalid workspace path')) return 400
  if (message.includes('unavailable')) return 404
  if (message.includes('not configured')) return 503
  return 500
}

export function sanitizedLogs(value: unknown) {
  return String(value || '').replace(/(?:E2B_API_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|Authorization)\s*[=:]\s*\S+/gi, '[redacted]').slice(-12000)
}

export function publicRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('not configured') || message.includes('supported runnable') || message.includes('package.json') || message.includes('limit') || message.includes('Invalid workspace path')) return message.slice(0, 500)
  if (message.includes('Dependency installation failed')) return 'Dependency installation failed inside the isolated runtime.'
  if (message.includes('Preview endpoint was unavailable')) return 'The isolated runtime started but no preview endpoint was available.'
  return 'Unable to start the isolated runtime. Please try again.'
}
