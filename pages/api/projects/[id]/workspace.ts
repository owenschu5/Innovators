import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../../../lib/supabaseClient'

const stages = ['define', 'validate', 'design', 'build', 'test', 'launch', 'improve']
const objectiveStatuses = ['proposed', 'planned', 'in_progress', 'testing', 'blocked', 'complete', 'archived']
const priorities = ['low', 'medium', 'high', 'critical']
const taskStatuses = ['todo', 'in_progress', 'blocked', 'review', 'complete']
const roles = ['builder', 'thinker', 'coder', 'researcher', 'designer', 'entrepreneur', 'any']

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : 'Workspace operation failed'
  if (message === 'Authentication required') return 401
  if (message.includes('denied') || message.includes('Read-only')) return 403
  if (message.includes('not found') || message.includes('unavailable')) return 404
  if (message.includes('Phase 1 workspace tables are missing')) return 503
  if (message.includes('Invalid') || message.includes('Missing')) return 400
  return 500
}

function missingPhaseSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return (
    record.code === 'PGRST205' ||
    record.message?.includes("Could not find the table 'public.workspace_objectives'") ||
    record.message?.includes("Could not find the 'current_stage' column") ||
    record.message?.includes("Could not find the 'objective_id' column") ||
    record.message?.includes("Could not find the 'suggested_role' column")
  )
}

function canEdit(permissions?: string | null) {
  return permissions !== 'viewer'
}

function clean(value: unknown) {
  return String(value || '').trim()
}

async function access(req: NextApiRequest, groupId: string) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Authentication required')

  const { data: auth } = await supabase.auth.getUser(token)
  if (!auth.user) throw new Error('Authentication required')

  const { data: group, error: groupError } = await supabase
    .from('idea_groups')
    .select('id, idea_id, name, summary, status, workspace_active, lead_user_id')
    .eq('id', groupId)
    .single()
  if (groupError || !group?.workspace_active || group.status !== 'approved') throw new Error('Workspace unavailable')

  const { data: member, error: memberError } = await supabase
    .from('idea_group_members')
    .select('id, permissions, member_role, is_lead')
    .eq('group_id', groupId)
    .eq('user_id', auth.user.id)
    .eq('invitation_status', 'accepted')
    .maybeSingle()
  if (memberError || !member) throw new Error('Workspace access denied')

  const { data: workspace, error: workspaceError } = await supabase
    .from('project_workspaces')
    .select('*')
    .eq('project_group_id', groupId)
    .single()
  if (workspaceError || !workspace) throw new Error('Workspace not found')

  return { user: auth.user, group, workspace, member }
}

async function loadOverview(groupId: string, ideaId: string, workspaceId: string, userId: string) {
  const [
    { data: idea },
    { data: members },
    objectivesResult,
    tasksResult,
    { data: activity },
    { data: userProfile },
  ] = await Promise.all([
    supabase.from('ideas').select('id,title,description,problem_statement,goals').eq('id', ideaId).maybeSingle(),
    supabase.from('idea_group_members').select('*, user:users(id,email,profile_type)').eq('group_id', groupId).order('created_at', { ascending: true }),
    supabase.from('workspace_objectives').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    supabase.from('project_tasks').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    supabase.from('project_activities').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(20),
    supabase.from('users').select('id,email,profile_type').eq('id', userId).maybeSingle(),
  ])

  if (missingPhaseSchema(objectivesResult.error) || missingPhaseSchema(tasksResult.error)) {
    throw new Error('Phase 1 workspace tables are missing. Run sql/migrations/20260811_workspace_phase1_foundation.sql in Supabase, then reload the app.')
  }
  if (objectivesResult.error) throw objectivesResult.error
  if (tasksResult.error) throw tasksResult.error

  return {
    idea,
    members: members || [],
    objectives: objectivesResult.data || [],
    tasks: tasksResult.data || [],
    activity: activity || [],
    userProfile,
  }
}

async function logActivity(groupId: string, actorId: string, eventType: string, metadata: Record<string, unknown>) {
  await supabase.from('project_activities').insert({ group_id: groupId, actor_id: actorId, event_type: eventType, metadata })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing project id' })

    const accessData = await access(req, id)

    if (req.method === 'GET') {
      const overview = await loadOverview(accessData.group.id, accessData.group.idea_id, accessData.workspace.id, accessData.user.id)
      return res.status(200).json({ project: accessData.group, workspace: accessData.workspace, member: accessData.member, ...overview })
    }

    if (!canEdit(accessData.member.permissions)) return res.status(403).json({ error: 'Read-only access' })

    if (req.method === 'PATCH') {
      const action = clean(req.body.action)
      if (action !== 'stage') return res.status(400).json({ error: 'Invalid action' })
      const stage = clean(req.body.stage).toLowerCase()
      if (!stages.includes(stage)) return res.status(400).json({ error: 'Invalid stage' })
      const { data, error } = await supabase
        .from('project_workspaces')
        .update({ current_stage: stage, stage_updated_by: accessData.user.id, stage_updated_at: new Date().toISOString() })
        .eq('id', accessData.workspace.id)
        .select('*')
        .single()
      if (missingPhaseSchema(error)) throw new Error('Phase 1 workspace tables are missing. Run sql/migrations/20260811_workspace_phase1_foundation.sql in Supabase, then reload the app.')
      if (error || !data) throw new Error(error?.message || 'Unable to update project stage')
      await logActivity(accessData.group.id, accessData.user.id, 'project_stage_changed', { stage })
      return res.status(200).json({ workspace: data })
    }

    if (req.method === 'POST') {
      const type = clean(req.body.type)

      if (type === 'objective') {
        const title = clean(req.body.title)
        if (!title) return res.status(400).json({ error: 'Missing objective title' })
        const status = objectiveStatuses.includes(clean(req.body.status)) ? clean(req.body.status) : 'proposed'
        const priority = priorities.includes(clean(req.body.priority)) ? clean(req.body.priority) : 'medium'
        const stage = stages.includes(clean(req.body.stage)) ? clean(req.body.stage) : accessData.workspace.current_stage || 'define'
        const { data, error } = await supabase
          .from('workspace_objectives')
          .insert({
            workspace_id: accessData.workspace.id,
            title,
            description: clean(req.body.description) || null,
            status,
            priority,
            stage,
            owner_id: clean(req.body.owner_id) || null,
            created_by: accessData.user.id,
          })
          .select('*')
          .single()
        if (missingPhaseSchema(error)) throw new Error('Phase 1 workspace tables are missing. Run sql/migrations/20260811_workspace_phase1_foundation.sql in Supabase, then reload the app.')
        if (error || !data) throw new Error(error?.message || 'Unable to create objective')
        await logActivity(accessData.group.id, accessData.user.id, 'objective_created', { objective_id: data.id, title })
        return res.status(201).json({ objective: data })
      }

      if (type === 'task') {
        const title = clean(req.body.title)
        if (!title) return res.status(400).json({ error: 'Missing task title' })
        const status = taskStatuses.includes(clean(req.body.status)) ? clean(req.body.status) : 'todo'
        const priority = priorities.includes(clean(req.body.priority)) ? clean(req.body.priority) : 'medium'
        const suggestedRole = roles.includes(clean(req.body.suggested_role)) ? clean(req.body.suggested_role) : 'any'
        const objectiveId = clean(req.body.objective_id) || null
        if (objectiveId) {
          const { data: objective } = await supabase
            .from('workspace_objectives')
            .select('id')
            .eq('id', objectiveId)
            .eq('workspace_id', accessData.workspace.id)
            .maybeSingle()
          if (!objective) return res.status(400).json({ error: 'Invalid objective' })
        }
        const { data, error } = await supabase
          .from('project_tasks')
          .insert({
            group_id: accessData.group.id,
            workspace_id: accessData.workspace.id,
            objective_id: objectiveId,
            title,
            description: clean(req.body.description) || null,
            status,
            priority,
            suggested_role: suggestedRole,
            stage: clean(req.body.stage) || accessData.workspace.current_stage || 'define',
            assigned_to: clean(req.body.assigned_to) || null,
            created_by: accessData.user.id,
          })
          .select('*')
          .single()
        if (missingPhaseSchema(error)) throw new Error('Phase 1 workspace tables are missing. Run sql/migrations/20260811_workspace_phase1_foundation.sql in Supabase, then reload the app.')
        if (error || !data) throw new Error(error?.message || 'Unable to create task')
        await logActivity(accessData.group.id, accessData.user.id, 'task_created', { task_id: data.id, title, suggested_role: suggestedRole })
        return res.status(201).json({ task: data })
      }

      return res.status(400).json({ error: 'Invalid creation type' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workspace operation failed'
    return res.status(statusFor(error)).json({ error: message })
  }
}
