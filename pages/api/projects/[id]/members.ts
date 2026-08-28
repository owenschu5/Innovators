import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../../../lib/supabaseClient'

const contributionRoles = ['builder', 'thinker', 'coder', 'researcher', 'designer', 'entrepreneur']
const permissionRoles = ['project_lead', 'lead', 'member', 'contributor', 'viewer']
const managerPermissions = ['project_lead', 'lead', 'owner', 'admin']

type MemberRow = {
  id: string
  group_id: string
  user_id: string | null
  member_name: string | null
  member_email: string | null
  member_role: string | null
  permissions: string | null
  is_lead: boolean | null
  invitation_status: string | null
  created_at: string
  user?: { id: string; email: string | null; profile_type: string | null; domains?: string | null } | null
}

type RoleNeedRow = {
  id: string
  role: string
  desired_count: number | null
}

type UserSearchRow = {
  id: string
  email: string | null
  profile_type: string | null
  domains?: string | null
  availability_status?: string | null
  weekly_availability?: string | null
}

type CandidateResult = ReturnType<typeof sanitizeCandidate>

function clean(value: unknown) {
  return String(value || '').trim()
}

function normalizeEmail(value?: string | null) {
  return clean(value).toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeRole(value: unknown) {
  const role = clean(value).toLowerCase()
  return contributionRoles.includes(role) ? role : ''
}

function splitRoles(value?: string | null) {
  return clean(value)
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean)
}

function displayName(email?: string | null) {
  const local = normalizeEmail(email).split('@')[0]
  return local ? local.replace(/[._-]/g, ' ') : 'Innovator'
}

function missingRoleNeeds(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return (
    record.code === '42P01' ||
    record.code === 'PGRST205' ||
    record.message?.includes("Could not find the table 'public.project_role_needs'") ||
    record.message?.includes("Could not find the 'project_role_needs'") ||
    record.message?.includes('schema cache')
  )
}

async function userFromRequest(req: NextApiRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  return data.user || null
}

async function access(req: NextApiRequest, groupId: string) {
  const user = await userFromRequest(req)
  if (!user) throw new Error('Authentication required')

  const { data: group, error: groupError } = await supabase
    .from('idea_groups')
    .select('id, idea_id, name, lead_user_id, lead_email, created_by, status, workspace_active')
    .eq('id', groupId)
    .single()
  if (groupError || !group) throw new Error('Project not found')

  const { data: member, error: memberError } = await supabase
    .from('idea_group_members')
    .select('id, permissions, member_role, member_email, is_lead, invitation_status')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .eq('invitation_status', 'accepted')
    .maybeSingle()
  if (memberError || !member) throw new Error('Workspace access denied')

  const actorEmail = normalizeEmail(user.email)
  const canManage =
    Boolean(member.is_lead) ||
    managerPermissions.includes(member.permissions || '') ||
    group.lead_user_id === user.id ||
    normalizeEmail(group.lead_email) === actorEmail ||
    group.created_by === user.id

  return { user, group, member, canManage }
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : 'Member operation failed'
  if (message.includes('Authentication')) return 401
  if (message.includes('denied') || message.includes('Only') || message.includes('cannot')) return 403
  if (message.includes('not found')) return 404
  if (message.includes('Missing') || message.includes('Invalid') || message.includes('already')) return 400
  return 500
}

async function logActivity(groupId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await supabase.from('project_activities').insert({ group_id: groupId, actor_id: actorId, event_type: eventType, metadata })
}

async function loadMembers(groupId: string) {
  const { data, error } = await supabase
    .from('idea_group_members')
    .select('*, user:users(id,email,profile_type,domains)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as MemberRow[]
}

async function loadRoleNeeds(groupId: string) {
  const { data, error } = await supabase
    .from('project_role_needs')
    .select('id, role, desired_count')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (error) {
    if (missingRoleNeeds(error)) return [] as RoleNeedRow[]
    throw error
  }

  return (data || []) as RoleNeedRow[]
}

function buildCoverage(roleNeeds: RoleNeedRow[], members: MemberRow[]) {
  return contributionRoles.map((role) => {
    const required = roleNeeds
      .filter((need) => need.role === role)
      .reduce((sum, need) => sum + Math.max(Number(need.desired_count || 0), 0), 0)
    const filled = members
      .filter((member) => member.invitation_status === 'accepted')
      .filter((member) => splitRoles(member.member_role || member.user?.profile_type).includes(role)).length
    const invited = members
      .filter((member) => member.invitation_status === 'invited')
      .filter((member) => splitRoles(member.member_role || member.user?.profile_type).includes(role)).length
    return { role, required, filled, invited, open: Math.max(required - filled, 0) }
  })
}

function sanitizeCandidate(user: UserSearchRow, coverage: ReturnType<typeof buildCoverage>, members: MemberRow[]) {
  const email = normalizeEmail(user.email)
  const roles = splitRoles(user.profile_type)
  const openRoleHits = coverage.filter((item) => item.open > 0 && roles.includes(item.role)).map((item) => item.role)
  const alreadyInProject = members.some((member) => normalizeEmail(member.member_email) === email || member.user_id === user.id)
  const availability = user.availability_status || 'open'
  const score =
    openRoleHits.length * 40 +
    (availability === 'open' ? 20 : availability === 'maybe' ? 10 : 0) +
    (user.domains ? 5 : 0)

  return {
    id: user.id,
    display_name: displayName(email),
    username: email.split('@')[0],
    roles,
    domains: splitRoles(user.domains),
    availability_status: availability,
    weekly_availability: user.weekly_availability || null,
    open_role_matches: openRoleHits,
    already_in_project: alreadyInProject,
    score,
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing project id' })

    const accessData = await access(req, id)
    const members = await loadMembers(id)
    const roleNeeds = await loadRoleNeeds(id)
    const coverage = buildCoverage(roleNeeds, members)

    if (req.method === 'GET') {
      let candidates: CandidateResult[] = []
      const query = clean(req.query.q).toLowerCase()
      const role = normalizeRole(req.query.role)
      if (query || role || req.query.matches === '1') {
        if (!accessData.canManage) throw new Error('Only project leads can search members')
        let userQuery = supabase
          .from('users')
          .select('id,email,profile_type,domains,availability_status,weekly_availability')
          .limit(30)

        if (query) {
          const like = `%${query.replace(/[%_]/g, '')}%`
          userQuery = userQuery.or(`email.ilike.${like},profile_type.ilike.${like},domains.ilike.${like}`)
        }

        const { data: users, error } = await userQuery
        if (error) throw error
        candidates = ((users || []) as UserSearchRow[])
          .map((user: UserSearchRow) => sanitizeCandidate(user, coverage, members))
          .filter((candidate: CandidateResult) => !candidate.already_in_project)
          .filter((candidate: CandidateResult) => !role || candidate.roles.includes(role))
          .sort((a: CandidateResult, b: CandidateResult) => b.score - a.score)
      }

      return res.status(200).json({ members, role_needs: roleNeeds, coverage, can_manage: accessData.canManage, candidates })
    }

    if (req.method === 'POST') {
      if (!accessData.canManage) throw new Error('Only project leads can invite members')
      const userId = clean(req.body.user_id)
      const requestedEmail = normalizeEmail(req.body.member_email)
      const requestedRole = normalizeRole(req.body.member_role)
      const message = clean(req.body.message)
      if (!userId && !requestedEmail) return res.status(400).json({ error: 'Missing user id or email address' })
      if (requestedEmail && !isValidEmail(requestedEmail)) return res.status(400).json({ error: 'Enter a valid email address' })
      if (!requestedRole) return res.status(400).json({ error: 'Choose a contribution role' })

      const candidateQuery = supabase.from('users').select('id,email,profile_type')
      const { data: candidate, error: candidateError } = userId
        ? await candidateQuery.eq('id', userId).maybeSingle()
        : await candidateQuery.eq('email', requestedEmail).maybeSingle()
      if (candidateError) throw candidateError

      const candidateEmail = normalizeEmail(candidate?.email || requestedEmail)
      if (!candidateEmail) throw new Error('Candidate not found')
      const existing = members.find((member) => normalizeEmail(member.member_email) === candidateEmail || member.user_id === userId)
      if (existing) throw new Error('This collaborator is already invited or on the team')

      const { data: member, error } = await supabase
        .from('idea_group_members')
        .insert({
          group_id: id,
          member_name: displayName(candidateEmail),
          member_email: candidateEmail,
          member_role: requestedRole,
          user_id: null,
          is_lead: false,
          invitation_status: 'invited',
          permissions: 'contributor',
        })
        .select('*')
        .single()
      if (error || !member) throw new Error(error?.message || 'Unable to invite collaborator')

      if (candidate?.id) {
        await supabase.from('notifications').insert({
          user_id: candidate.id,
          type: 'project_invitation',
          related_idea_id: accessData.group.idea_id,
        })
      }
      await logActivity(id, accessData.user.id, 'collaborator_invited', {
        user_id: candidate?.id || null,
        member_email: candidateEmail,
        member_id: member.id,
        member_role: requestedRole,
        message,
      })
      return res.status(201).json({ member })
    }

    if (req.method === 'PATCH') {
      const action = clean(req.body.action)

      if (action === 'role_needs') {
        if (!accessData.canManage) throw new Error('Only project leads can modify role needs')
        const role = normalizeRole(req.body.role)
        const desiredCount = Math.max(Number(req.body.desired_count || 0), 0)
        if (!role) return res.status(400).json({ error: 'Invalid role' })

        await supabase.from('project_role_needs').delete().eq('group_id', id).eq('role', role)
        if (desiredCount > 0) {
          const { error } = await supabase.from('project_role_needs').insert({
            group_id: id,
            idea_id: accessData.group.idea_id,
            role,
            priority: 'required',
            desired_count: desiredCount,
            created_by: accessData.user.id,
          })
          if (error) throw error
        }
        await logActivity(id, accessData.user.id, 'team_role_needs_changed', { role, desired_count: desiredCount })
        return res.status(200).json({ ok: true })
      }

      if (action === 'update_member') {
        if (!accessData.canManage) throw new Error('Only project leads can manage members')
        const memberId = clean(req.body.member_id)
        const member = members.find((item) => item.id === memberId)
        if (!member) throw new Error('Member not found')
        const memberRole = clean(req.body.member_role)
        const permission = clean(req.body.permissions)
        const updates: Record<string, unknown> = {}
        if (memberRole) updates.member_role = memberRole
        if (permission) {
          if (!permissionRoles.includes(permission)) return res.status(400).json({ error: 'Invalid permission' })
          updates.permissions = permission === 'member' ? 'contributor' : permission
          updates.is_lead = ['project_lead', 'lead'].includes(permission)
        }
        if (!Object.keys(updates).length) return res.status(400).json({ error: 'No member updates provided' })
        const { data, error } = await supabase.from('idea_group_members').update(updates).eq('id', memberId).eq('group_id', id).select('*').single()
        if (error || !data) throw new Error(error?.message || 'Unable to update member')
        await logActivity(id, accessData.user.id, 'member_updated', { member_id: memberId, ...updates })
        return res.status(200).json({ member: data })
      }

      if (action === 'cancel_invitation') {
        if (!accessData.canManage) throw new Error('Only project leads can cancel invitations')
        const memberId = clean(req.body.member_id)
        const member = members.find((item) => item.id === memberId && item.invitation_status === 'invited')
        if (!member) throw new Error('Invitation not found')
        const { data, error } = await supabase
          .from('idea_group_members')
          .update({ invitation_status: 'cancelled', responded_at: new Date().toISOString() })
          .eq('id', memberId)
          .eq('group_id', id)
          .select('*')
          .single()
        if (error || !data) throw new Error(error?.message || 'Unable to cancel invitation')
        await logActivity(id, accessData.user.id, 'invitation_cancelled', { member_id: memberId })
        return res.status(200).json({ member: data })
      }

      if (action === 'remove_member') {
        if (!accessData.canManage) throw new Error('Only project leads can remove members')
        const memberId = clean(req.body.member_id)
        const member = members.find((item) => item.id === memberId)
        if (!member) throw new Error('Member not found')
        if (member.is_lead) {
          const leadCount = members.filter((item) => item.invitation_status === 'accepted' && item.is_lead).length
          if (leadCount <= 1) throw new Error('The only project lead cannot be removed')
        }
        const { data, error } = await supabase
          .from('idea_group_members')
          .update({ invitation_status: 'removed', responded_at: new Date().toISOString() })
          .eq('id', memberId)
          .eq('group_id', id)
          .select('*')
          .single()
        if (error || !data) throw new Error(error?.message || 'Unable to remove member')
        await logActivity(id, accessData.user.id, 'member_removed', { member_id: memberId, user_id: member.user_id })
        return res.status(200).json({ member: data })
      }

      if (action === 'leave_project') {
        const member = members.find((item) => item.user_id === accessData.user.id && item.invitation_status === 'accepted')
        if (!member) throw new Error('Member not found')
        if (member.is_lead) {
          const leadCount = members.filter((item) => item.invitation_status === 'accepted' && item.is_lead).length
          if (leadCount <= 1) throw new Error('Project lead cannot leave until another project lead exists')
        }
        const { data, error } = await supabase
          .from('idea_group_members')
          .update({ invitation_status: 'left', responded_at: new Date().toISOString() })
          .eq('id', member.id)
          .eq('group_id', id)
          .select('*')
          .single()
        if (error || !data) throw new Error(error?.message || 'Unable to leave project')
        await logActivity(id, accessData.user.id, 'member_left', { member_id: member.id })
        return res.status(200).json({ member: data })
      }

      return res.status(400).json({ error: 'Invalid action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Member operation failed'
    return res.status(statusFor(error)).json({ error: message })
  }
}
