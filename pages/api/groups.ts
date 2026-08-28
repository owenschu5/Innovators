import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'

type IdeaGroupRow = {
  id: string
  idea_id: string
  name: string
  created_by: string
  lead_user_id: string | null
  lead_name: string | null
  lead_email: string | null
  summary: string | null
  status: string | null
  created_at: string
}

type IdeaGroupMemberRow = {
  id: string
  group_id: string
  member_name: string
  member_email: string
  member_role: string | null
  user_id: string | null
  is_lead: boolean | null
  invitation_status?: string | null
  permissions?: string | null
  created_at: string
}

type CreateGroupMember = {
  name: string
  email: string
  role?: string
}

function normalizeMembers(members: CreateGroupMember[], leadName: string, leadEmail: string) {
  const deduped = new Map<string, CreateGroupMember>()

  for (const member of members) {
    const trimmedEmail = member.email.trim().toLowerCase()

    if (!trimmedEmail) {
      continue
    }

    deduped.set(trimmedEmail, {
      name: member.name.trim() || trimmedEmail,
      email: trimmedEmail,
      role: member.role?.trim() || '',
    })
  }

  if (!deduped.has(leadEmail.toLowerCase())) {
    deduped.set(leadEmail.toLowerCase(), {
      name: leadName.trim() || leadEmail,
      email: leadEmail.toLowerCase(),
      role: 'Lead',
    })
  }

  return [...deduped.values()]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { idea_id } = req.query

    if (!idea_id || typeof idea_id !== 'string') {
      return res.status(400).json({ error: 'Missing idea_id' })
    }

    const { data: groups, error: groupsError } = await supabase
      .from('idea_groups')
      .select('*')
      .eq('idea_id', idea_id)
      .order('created_at', { ascending: true })

    if (groupsError) {
      return res.status(500).json({ error: groupsError.message })
    }

    const groupIds = ((groups || []) as IdeaGroupRow[]).map(group => group.id)
    let membersByGroup: Record<string, IdeaGroupMemberRow[]> = {}

    if (groupIds.length > 0) {
      const { data: members, error: membersError } = await supabase
        .from('idea_group_members')
        .select('*')
        .in('group_id', groupIds)
        .order('created_at', { ascending: true })

      if (membersError) {
        return res.status(500).json({ error: membersError.message })
      }

      membersByGroup = ((members || []) as IdeaGroupMemberRow[]).reduce<Record<string, IdeaGroupMemberRow[]>>(
        (acc, member) => {
          acc[member.group_id] = [...(acc[member.group_id] || []), member]
          return acc
        },
        {}
      )
    }

    return res.status(200).json({
      groups: ((groups || []) as IdeaGroupRow[]).map(group => ({
        ...group,
        members: membersByGroup[group.id] || [],
      })),
    })
  }

  if (req.method === 'POST') {
    const {
      idea_id,
      created_by,
      name,
      lead_name,
      lead_email,
      summary,
      members,
    } = req.body as {
      idea_id?: string
      created_by?: string
      name?: string
      lead_name?: string
      lead_email?: string
      summary?: string
      members?: CreateGroupMember[]
    }

    if (!idea_id || !created_by || !name || !lead_name || !lead_email) {
      return res.status(400).json({ error: 'Missing required group fields' })
    }

    const { data: existingGroup } = await supabase
      .from('idea_groups')
      .select('id')
      .eq('idea_id', idea_id)
      .maybeSingle()

    if (existingGroup) {
      return res.status(409).json({ error: 'A project group already exists for this idea' })
    }

    const { data: idea, error: ideaError } = await supabase
      .from('ideas')
      .select('id, creator_id')
      .eq('id', idea_id)
      .single()

    if (ideaError || !idea) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    const { data: creator } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', created_by)
      .maybeSingle()

    const normalizedLeadEmail = lead_email.trim().toLowerCase()
    const requesterEmail = creator?.email?.trim().toLowerCase()
    const requesterIsPoster = idea.creator_id === created_by
    const requesterIsLead = requesterEmail === normalizedLeadEmail

    if (!requesterIsPoster && !requesterIsLead) {
      return res
        .status(403)
        .json({ error: 'Only the idea poster or the selected lead can form the project group' })
    }

    const { data: leadUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedLeadEmail)
      .maybeSingle()

    const { data: insertedGroup, error: groupError } = await supabase
      .from('idea_groups')
      .insert([
        {
          idea_id,
          created_by,
          name: name.trim(),
          lead_user_id: leadUser?.id || null,
          lead_name: lead_name.trim(),
          lead_email: normalizedLeadEmail,
          summary: summary?.trim() || null,
          status: 'forming',
        },
      ])
      .select('*')
      .single()

    if (groupError || !insertedGroup) {
      return res.status(500).json({ error: groupError?.message || 'Unable to create project group' })
    }

    const normalizedMembers = normalizeMembers(members || [], lead_name, normalizedLeadEmail)
    const membersToInsert = normalizedMembers.map(member => ({
      group_id: insertedGroup.id,
      member_name: member.name,
      member_email: member.email,
      member_role: member.role || null,
      user_id: member.email === normalizedLeadEmail ? leadUser?.id || null : null,
      is_lead: member.email === normalizedLeadEmail,
      invitation_status: member.email === normalizedLeadEmail ? 'accepted' : 'invited',
      permissions: member.email === normalizedLeadEmail ? 'project_lead' : 'contributor',
    }))

    const { data: insertedMembers, error: membersError } = await supabase
      .from('idea_group_members')
      .insert(membersToInsert)
      .select('*')

    if (membersError) {
      return res.status(500).json({ error: membersError.message })
    }

    return res.status(201).json({
      group: {
        ...(insertedGroup as IdeaGroupRow),
        members: (insertedMembers || []) as IdeaGroupMemberRow[],
      },
    })
  }

  if (req.method === 'PATCH') {
    const { group_id, actor_id, user_id, member_role } = req.body as {
      group_id?: string
      actor_id?: string
      user_id?: string
      member_role?: string
    }

    if (!group_id || !actor_id || !user_id) return res.status(400).json({ error: 'Missing invite fields' })

    const { data: group, error: groupError } = await supabase
      .from('idea_groups')
      .select('id, idea_id, lead_user_id, lead_email, created_by')
      .eq('id', group_id)
      .single()
    if (groupError || !group) return res.status(404).json({ error: 'Project group not found' })

    const { data: actor } = await supabase.from('users').select('id,email').eq('id', actor_id).maybeSingle()
    const actorEmail = actor?.email?.trim().toLowerCase()
    const authorized =
      group.created_by === actor_id ||
      group.lead_user_id === actor_id ||
      group.lead_email?.trim().toLowerCase() === actorEmail
    if (!authorized) return res.status(403).json({ error: 'Only the group creator or lead can invite collaborators' })

    const { data: candidate, error: candidateError } = await supabase
      .from('users')
      .select('id,email,profile_type')
      .eq('id', user_id)
      .single()
    if (candidateError || !candidate?.email) return res.status(404).json({ error: 'Candidate not found' })

    const candidateEmail = candidate.email.trim().toLowerCase()
    const { data: existing } = await supabase
      .from('idea_group_members')
      .select('id, invitation_status')
      .eq('group_id', group_id)
      .eq('member_email', candidateEmail)
      .maybeSingle()
    if (existing) return res.status(409).json({ error: 'This collaborator is already invited or on the team' })

    const { data, error } = await supabase
      .from('idea_group_members')
      .insert({
        group_id,
        member_name: candidate.email.split('@')[0],
        member_email: candidateEmail,
        member_role: member_role?.trim() || candidate.profile_type || 'Contributor',
        user_id: null,
        is_lead: false,
        invitation_status: 'invited',
        permissions: 'contributor',
      })
      .select('*')
      .single()

    if (error || !data) return res.status(500).json({ error: error?.message || 'Unable to invite collaborator' })

    await supabase.from('project_activities').insert({ group_id, actor_id, event_type: 'collaborator_invited', metadata: { user_id } })
    return res.status(200).json({ member: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
