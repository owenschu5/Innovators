import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../../lib/supabaseClient'
import { getAdminSessionFromRequest } from '../../../lib/adminAuth'
import { authenticatedSupabase } from '../../../lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { id } = req.query
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing project id' })
  const isAdmin = Boolean(getAdminSessionFromRequest(req))
  let db = supabase
  let user: { id: string } | null = null
  if (!isAdmin) {
    try {
      const authenticated = await authenticatedSupabase(req)
      db = authenticated.db
      user = authenticated.user
    } catch {
      return res.status(401).json({ error: 'Authentication required' })
    }
  }
  const { data: project, error } = await db.from('idea_groups').select('*').eq('id', id).single()
  if (error || !project) return res.status(404).json({ error: 'Project not found' })
  if (!isAdmin) {
    if (!project.workspace_active || project.status !== 'approved') return res.status(403).json({ error: 'This workspace is not available yet.' })
    const { data: membership } = await db.from('idea_group_members').select('id').eq('group_id', id).eq('user_id', user!.id).eq('invitation_status', 'accepted').maybeSingle()
    if (!membership) return res.status(403).json({ error: 'You are not a member of this project.' })
  }
  const [{ data: members }, { data: tasks }, { data: activity }] = await Promise.all([
    db.from('idea_group_members').select('*').eq('group_id', id),
    db.from('project_tasks').select('*').eq('group_id', id).order('created_at', { ascending: false }).limit(8),
    db.from('project_activities').select('*').eq('group_id', id).order('created_at', { ascending: false }).limit(12),
  ])
  return res.status(200).json({ project, members: members || [], tasks: tasks || [], activity: activity || [] })
}
