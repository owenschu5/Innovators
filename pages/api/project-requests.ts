import type { NextApiRequest, NextApiResponse } from 'next'
import { getAdminSessionFromRequest } from '../../lib/adminAuth'
import { supabase } from '../../lib/supabaseClient'

type ProjectRequestRow = {
  id: string
  idea_id: string
  lead_id: string | null
  goals: string | null
  outcomes: string | null
  timeline: string | null
  location: string | null
  evidence_data: string | null
  status: string | null
  created_at: string
  group_id: string | null
  requested_by: string | null
  request_notes: string | null
  admin_notes: string | null
  reviewed_at: string | null
}

type IdeaRow = {
  id: string
  title: string
  creator_id: string
}

type GroupRow = {
  id: string
  idea_id: string
  name: string
  lead_user_id: string | null
  lead_name: string | null
  lead_email: string | null
  summary: string | null
  status: string | null
}

type MemberRow = {
  group_id: string
  member_name: string
  member_email: string
  member_role: string | null
  is_lead: boolean | null
  invitation_status?: string | null
}

type UserRow = {
  id: string
  email: string
}

async function buildRequestsResponse(requests: ProjectRequestRow[]) {
  const ideaIds = [...new Set(requests.map(request => request.idea_id))]
  const groupIds = [...new Set(requests.map(request => request.group_id).filter(Boolean))] as string[]
  const userIds = [
    ...new Set(
      requests
        .flatMap(request => [request.requested_by, request.lead_id])
        .filter(Boolean)
    ),
  ] as string[]

  const { data: ideas } = ideaIds.length
    ? await supabase.from('ideas').select('id, title, creator_id').in('id', ideaIds)
    : { data: [] as IdeaRow[] }
  const { data: groups } = groupIds.length
    ? await supabase.from('idea_groups').select('*').in('id', groupIds)
    : { data: [] as GroupRow[] }
  const { data: members } = groupIds.length
    ? await supabase
        .from('idea_group_members')
        .select('group_id, member_name, member_email, member_role, is_lead, invitation_status')
        .in('group_id', groupIds)
        .order('created_at', { ascending: true })
    : { data: [] as MemberRow[] }
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, email').in('id', userIds)
    : { data: [] as UserRow[] }

  const ideaMap = Object.fromEntries(((ideas || []) as IdeaRow[]).map(idea => [idea.id, idea]))
  const groupMap = Object.fromEntries(((groups || []) as GroupRow[]).map(group => [group.id, group]))
  const userMap = Object.fromEntries(((users || []) as UserRow[]).map(user => [user.id, user]))
  const membersByGroup = ((members || []) as MemberRow[]).reduce<Record<string, MemberRow[]>>((acc, member) => {
    acc[member.group_id] = [...(acc[member.group_id] || []), member]
    return acc
  }, {})

  return requests.map(request => ({
    ...request,
    idea: ideaMap[request.idea_id] || null,
    group: request.group_id
      ? {
          ...(groupMap[request.group_id] || null),
          members: membersByGroup[request.group_id] || [],
        }
      : null,
    requester_email: request.requested_by ? userMap[request.requested_by]?.email || null : null,
    lead_email:
      (request.lead_id ? userMap[request.lead_id]?.email : null) ||
      (request.group_id ? groupMap[request.group_id]?.lead_email || null : null),
  }))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { idea_id } = req.query

    if (typeof idea_id === 'string') {
      const { data, error } = await supabase
        .from('project_requests')
        .select('*')
        .eq('idea_id', idea_id)
        .order('created_at', { ascending: false })

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      const requests = await buildRequestsResponse((data || []) as ProjectRequestRow[])
      return res.status(200).json({ requests })
    }

    const adminSession = getAdminSessionFromRequest(req)
    if (!adminSession) {
      return res.status(401).json({ error: 'Admin authentication required' })
    }

    const { data, error } = await supabase
      .from('project_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const requests = await buildRequestsResponse((data || []) as ProjectRequestRow[])
    return res.status(200).json({ requests })
  }

  if (req.method === 'POST') {
    const {
      idea_id,
      group_id,
      requested_by,
      goals,
      outcomes,
      timeline,
      location,
      evidence_data,
      request_notes,
    } = req.body as {
      idea_id?: string
      group_id?: string
      requested_by?: string
      goals?: string
      outcomes?: string
      timeline?: string
      location?: string
      evidence_data?: string
      request_notes?: string
    }

    if (!idea_id || !group_id || !requested_by || !goals || !outcomes) {
      return res.status(400).json({ error: 'Missing required project request fields' })
    }

    const { data: idea, error: ideaError } = await supabase
      .from('ideas')
      .select('id, title, creator_id')
      .eq('id', idea_id)
      .single()

    if (ideaError || !idea) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    const { data: group, error: groupError } = await supabase
      .from('idea_groups')
      .select('*')
      .eq('id', group_id)
      .eq('idea_id', idea_id)
      .single()

    if (groupError || !group) {
      return res.status(404).json({ error: 'Project group not found for this idea' })
    }

    const { data: requester, error: requesterError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', requested_by)
      .single()

    if (requesterError || !requester) {
      return res.status(404).json({ error: 'Requesting user not found' })
    }

    const requesterEmail = requester.email.trim().toLowerCase()
    const allowedRequester =
      idea.creator_id === requested_by ||
      group.lead_user_id === requested_by ||
      group.lead_email?.trim().toLowerCase() === requesterEmail

    if (!allowedRequester) {
      return res
        .status(403)
        .json({ error: 'Only the idea poster or assigned lead can request project platform review' })
    }

    const { data: activeRequests } = await supabase
      .from('project_requests')
      .select('id')
      .eq('idea_id', idea_id)
      .in('status', ['pending', 'in_review'])

    if ((activeRequests || []).length > 0) {
      return res.status(409).json({ error: 'This idea already has an active project request' })
    }

    const { data: acceptedMembers, error: membersError } = await supabase
      .from('idea_group_members')
      .select('id')
      .eq('group_id', group_id)
      .eq('invitation_status', 'accepted')

    if (membersError) return res.status(500).json({ error: membersError.message })
    if (!acceptedMembers?.length) {
      return res.status(400).json({ error: 'At least one invited member must accept before submission.' })
    }

    const { data, error } = await supabase
      .from('project_requests')
      .insert([
        {
          idea_id,
          lead_id: group.lead_user_id || requested_by,
          goals: goals.trim(),
          outcomes: outcomes.trim(),
          timeline: timeline?.trim() || null,
          location: location?.trim() || null,
          evidence_data: evidence_data?.trim() || null,
          status: 'pending',
          group_id,
          requested_by,
          request_notes: request_notes?.trim() || null,
        },
      ])
      .select('*')
      .single()

    if (error || !data) {
      return res.status(500).json({ error: error?.message || 'Unable to create project request' })
    }

    await supabase
      .from('idea_groups')
      .update({ status: 'pending_admin_review', submitted_at: new Date().toISOString() })
      .eq('id', group_id)

    const [request] = await buildRequestsResponse([data as ProjectRequestRow])
    return res.status(201).json({ request })
  }

  if (req.method === 'PATCH') {
    const adminSession = getAdminSessionFromRequest(req)
    if (!adminSession) {
      return res.status(401).json({ error: 'Admin authentication required' })
    }

    const { id, status, admin_notes } = req.body as {
      id?: string
      status?: string
      admin_notes?: string
    }

    if (!id || !status) {
      return res.status(400).json({ error: 'Missing id or status' })
    }

    const { data, error } = await supabase
      .from('project_requests')
      .update({
        status,
        admin_notes: admin_notes?.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      return res.status(500).json({ error: error?.message || 'Unable to update project request' })
    }

    if (data.group_id) {
      const groupUpdate =
        status === 'approved'
          ? { status: 'approved', workspace_active: true, approved_at: new Date().toISOString(), admin_notes: admin_notes?.trim() || null }
          : status === 'needs_info'
            ? { status: 'changes_requested', workspace_active: false, admin_notes: admin_notes?.trim() || null }
            : status === 'rejected'
              ? { status: 'rejected', workspace_active: false, admin_notes: admin_notes?.trim() || null }
              : { status: 'pending_admin_review', admin_notes: admin_notes?.trim() || null }
      const { error: groupUpdateError } = await supabase.from('idea_groups').update(groupUpdate).eq('id', data.group_id)
      if (groupUpdateError) return res.status(500).json({ error: groupUpdateError.message })
    }

    const [request] = await buildRequestsResponse([data as ProjectRequestRow])
    return res.status(200).json({ request })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
