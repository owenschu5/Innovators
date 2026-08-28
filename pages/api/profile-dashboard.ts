import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { user_id } = req.query
  if (typeof user_id !== 'string') return res.status(400).json({ error: 'Missing user_id' })
  const { data: user } = await supabase.from('users').select('id,email,profile_type,domains,created_at').eq('id', user_id).single()
  if (!user) return res.status(404).json({ error: 'Profile not found' })

  const userEmail = String(user.email || '').trim().toLowerCase()
  const membershipFilter = userEmail
    ? `user_id.eq.${user_id},member_email.eq.${userEmail}`
    : `user_id.eq.${user_id}`

  const [{ data: createdIdeas }, { data: comments }, { data: memberships }, { data: requests }] = await Promise.all([
    supabase.from('ideas').select('id,title,description,status,created_at,last_activity,creator_id').eq('creator_id', user_id).order('last_activity', { ascending: false }),
    supabase.from('idea_comments').select('id,idea_id,content,created_at').eq('author_id', user_id).order('created_at', { ascending: false }),
    supabase.from('idea_group_members').select('*, group:idea_groups(id,name,idea_id,status,summary,workspace_active,created_at)').or(membershipFilter).order('created_at', { ascending: false }),
    supabase.from('project_requests').select('*, group:idea_groups(id,name,status,idea_id)').or(`requested_by.eq.${user_id},lead_id.eq.${user_id}`).order('created_at', { ascending: false }),
  ])
  const commentRows: any[] = comments || []
  const createdIdeaRows: any[] = createdIdeas || []
  const membershipRows: any[] = memberships || []
  const requestRows: any[] = requests || []
  const commentIdeaIds = [...new Set(commentRows.map(comment => comment.idea_id))]
  const { data: contributedIdeas } = commentIdeaIds.length ? await supabase.from('ideas').select('id,title,description,status,created_at,last_activity,creator_id').in('id', commentIdeaIds).neq('creator_id', user_id) : { data: [] }
  const invitations = membershipRows.filter(member => member.invitation_status === 'invited')
  const activeGroups = membershipRows.filter(member => member.invitation_status === 'accepted' && member.group?.workspace_active)
  const activities = [
    ...createdIdeaRows.map(idea => ({ type: 'Created idea', label: idea.title, created_at: idea.created_at, href: `/ideas/${idea.id}` })),
    ...commentRows.map(comment => ({ type: 'Contributed to discussion', label: comment.content.slice(0, 90), created_at: comment.created_at, href: `/ideas/${comment.idea_id}` })),
    ...membershipRows.filter(member => member.invitation_status === 'accepted').map(member => ({ type: 'Joined project group', label: member.group?.name || 'Project group', created_at: member.responded_at || member.created_at, href: `/projects/${member.group_id}` })),
  ].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return res.status(200).json({ user, createdIdeas: createdIdeaRows, contributedIdeas: contributedIdeas || [], memberships: membershipRows, requests: requestRows, invitations, activities, stats: { ideasCreated: createdIdeaRows.length, ideasContributed: contributedIdeas?.length || 0, activeGroups: activeGroups.length, pendingRequests: requestRows.filter(request => ['pending','in_review','needs_info'].includes(request.status)).length, collaborations: membershipRows.filter(member => member.invitation_status === 'accepted').length } })
}
