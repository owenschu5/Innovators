import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../../../lib/supabaseClient'
import { calculateCandidateMatch, makeProjectSignal, splitSignalList } from '../../../../lib/matching/calculateMatch'
import type { TeamMemberSignal } from '../../../../lib/matching/calculateTeamGaps'

type CandidateUser = {
  id: string
  email: string | null
  profile_type: string | null
  domains: string | null
  skills?: string | null
  availability_status?: string | null
  weekly_availability?: string | null
}

type ProposedMember = {
  email?: string
  role?: string
}

type RoleNeedInput = {
  role: string
  desired_count?: number
}

function cleanList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function missingMatcherSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return (
    record.code === 'PGRST205' ||
    record.message?.includes("Could not find the table 'public.skills'") ||
    record.message?.includes("Could not find the table 'public.project_role_needs'") ||
    record.message?.includes("Could not find the table 'public.project_skill_needs'") ||
    record.message?.includes("Could not find the 'skills' column") ||
    record.message?.includes("Could not find the 'availability_status' column")
  )
}

async function getAuthenticatedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Authentication required')
  const { data } = await supabase.auth.getUser(token)
  if (!data.user) throw new Error('Authentication required')
  return data.user
}

async function saveNeeds(input: {
  ideaId: string
  groupId?: string | null
  userId: string
  roles: string[]
  roleNeeds?: RoleNeedInput[]
  skills: string[]
}) {
  if (!input.groupId) return

  await supabase.from('project_role_needs').delete().eq('group_id', input.groupId)
  await supabase.from('project_skill_needs').delete().eq('group_id', input.groupId)

  if (input.roles.length) {
    const { error } = await supabase.from('project_role_needs').insert(
      (input.roleNeeds?.length ? input.roleNeeds : input.roles.map((role) => ({ role, desired_count: 1 }))).map((need) => ({
        idea_id: input.ideaId,
        group_id: input.groupId,
        role: need.role.toLowerCase(),
        priority: 'required',
        desired_count: Math.max(Number(need.desired_count || 1), 1),
        created_by: input.userId,
      }))
    )
    if (missingMatcherSchema(error)) throw new Error('Auto Matcher database tables are missing. Run sql/migrations/20260812_auto_matcher_phase1.sql in Supabase, then reload the app.')
    if (error) throw error
  }

  for (const skill of input.skills) {
    const { data: skillRow, error: skillError } = await supabase
      .from('skills')
      .upsert({ name: skill }, { onConflict: 'name' })
      .select('id,name')
      .single()
    if (missingMatcherSchema(skillError)) throw new Error('Auto Matcher database tables are missing. Run sql/migrations/20260812_auto_matcher_phase1.sql in Supabase, then reload the app.')
    if (skillError || !skillRow) throw skillError || new Error('Unable to save skill need')

    const { error } = await supabase.from('project_skill_needs').insert({
      idea_id: input.ideaId,
      group_id: input.groupId,
      skill_id: skillRow.id,
      skill_name: skillRow.name,
      priority: 'preferred',
      created_by: input.userId,
    })
    if (error) throw error
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing idea id' })
    const user = await getAuthenticatedUser(req)

    const roleNeedsInput = (Array.isArray(req.body.role_needs) ? req.body.role_needs : []) as RoleNeedInput[]
    const roleNeeds = roleNeedsInput
      .map((need) => ({ role: String(need.role || '').trim().toLowerCase(), desired_count: Math.max(Number(need.desired_count || 0), 0) }))
      .filter((need) => need.role && need.desired_count > 0)
    const roles = roleNeeds.length ? roleNeeds.map((need) => need.role) : cleanList(req.body.roles).map((role) => role.toLowerCase())
    const skills = cleanList(req.body.skills)
    const matchMode = req.body.match_mode === 'skill' ? 'skill' : 'role'
    const refineRole = String(req.body.refine_role || '').trim().toLowerCase()
    const expectedAvailability = String(req.body.expected_availability || '').trim()
    const stage = String(req.body.stage || 'validate').trim().toLowerCase()
    const groupId = String(req.body.group_id || '').trim() || null
    const proposedMembers = (Array.isArray(req.body.proposed_members) ? req.body.proposed_members : []) as ProposedMember[]
    if (!roles.length) return res.status(400).json({ error: 'Choose at least one role slot first.' })
    if (matchMode === 'skill' && (!refineRole || !skills.length)) return res.status(400).json({ error: 'Choose a role and at least one skill to refine.' })

    const { data: idea, error: ideaError } = await supabase
      .from('ideas')
      .select('id,title,description,creator_id,domain_id, domain:domains(name)')
      .eq('id', id)
      .single()
    if (ideaError || !idea) return res.status(404).json({ error: 'Idea not found' })

    const { data: requesterProfile } = await supabase.from('users').select('id,email').eq('id', user.id).maybeSingle()
    const requesterEmail = requesterProfile?.email?.trim().toLowerCase() || user.email?.trim().toLowerCase()
    let authorized = idea.creator_id === user.id

    if (groupId) {
      const { data: group } = await supabase.from('idea_groups').select('id,lead_user_id,lead_email,created_by').eq('id', groupId).eq('idea_id', id).maybeSingle()
      authorized = Boolean(
        group &&
          (group.created_by === user.id ||
            group.lead_user_id === user.id ||
            group.lead_email?.trim().toLowerCase() === requesterEmail ||
            idea.creator_id === user.id)
      )
    }

    if (!authorized) return res.status(403).json({ error: 'Only the idea poster or project group lead can find collaborators.' })

    await saveNeeds({ ideaId: id, groupId, userId: user.id, roles, roleNeeds, skills })

    const existingTeam: TeamMemberSignal[] = proposedMembers.map((member) => ({
      roles: splitSignalList(member.role || ''),
      skills: [],
    }))
    const excludedEmails = new Set(proposedMembers.map((member) => member.email?.trim().toLowerCase()).filter(Boolean) as string[])
    if (requesterEmail) excludedEmails.add(requesterEmail)

    if (groupId) {
      const { data: members } = await supabase
        .from('idea_group_members')
        .select('member_email,member_role,invitation_status,user:users(profile_type,skills)')
        .eq('group_id', groupId)
      ;(members || []).forEach((member: any) => {
        if (member.member_email) excludedEmails.add(member.member_email.trim().toLowerCase())
        if (member.invitation_status === 'accepted') {
          existingTeam.push({
            roles: splitSignalList(member.user?.profile_type || member.member_role || ''),
            skills: splitSignalList(member.user?.skills || ''),
          })
        }
      })
    }

    const { data: candidates, error: candidatesError } = await supabase
      .from('users')
      .select('id,email,profile_type,domains,skills,availability_status,weekly_availability')
      .neq('id', user.id)
      .limit(100)
    if (missingMatcherSchema(candidatesError)) {
      throw new Error('Auto Matcher database columns are missing. Run sql/migrations/20260812_auto_matcher_phase1.sql in Supabase, then reload the app.')
    }
    if (candidatesError) throw candidatesError

    const domainName = Array.isArray((idea as any).domain) ? (idea as any).domain[0]?.name : (idea as any).domain?.name
    const roleSlotNeeds = roleNeeds.length ? roleNeeds : roles.map((role) => ({ role, desired_count: 1 }))
    const filledByRole = new Map<string, number>()
    existingTeam.forEach((member) => {
      member.roles.forEach((role) => filledByRole.set(role, (filledByRole.get(role) || 0) + 1))
    })
    const remainingRoleNeeds = roleSlotNeeds
      .map((need) => ({
        role: need.role,
        desiredCount: Math.max(need.desired_count - (filledByRole.get(need.role) || 0), 0),
        priority: 'required' as const,
      }))
      .filter((need) => need.desiredCount > 0)
    const coreRolesFilled = remainingRoleNeeds.length === 0
    const activeRoleNeeds =
      matchMode === 'skill'
        ? [{ role: refineRole, desiredCount: 1, priority: 'required' as const }]
        : remainingRoleNeeds

    if (coreRolesFilled && matchMode === 'role') {
      return res.status(200).json({
        matches: [],
        team_coverage: {
          requested_roles: roleSlotNeeds,
          remaining_roles: remainingRoleNeeds,
          filled_roles: Object.fromEntries(filledByRole.entries()),
          core_roles_filled: coreRolesFilled,
          requested_skills: [],
          existing_team_size: existingTeam.length,
        },
      })
    }

    const projectSignal = makeProjectSignal({
      roleNeeds: activeRoleNeeds,
      skills,
      interests: [domainName, ...String(idea.title || '').split(/\s+/)].filter(Boolean),
      stage,
      expectedAvailability,
      mode: matchMode,
    })

    const matches = ((candidates || []) as CandidateUser[])
      .filter((candidate) => candidate.email && !excludedEmails.has(candidate.email.trim().toLowerCase()))
      .filter((candidate) => {
        if (matchMode !== 'skill') return true
        return splitSignalList(candidate.profile_type).includes(refineRole)
      })
      .map((candidate) => {
        const match = calculateCandidateMatch(
          projectSignal,
          {
            id: candidate.id,
            displayName: candidate.email?.split('@')[0] || 'Member',
            roles: splitSignalList(candidate.profile_type),
            skills: splitSignalList(candidate.skills),
            interests: splitSignalList(candidate.domains),
            availabilityStatus: candidate.availability_status,
            weeklyAvailability: candidate.weekly_availability,
            contributionCount: 0,
          },
          existingTeam
        )
        return {
          user_id: candidate.id,
          display_name: match.candidate.displayName,
          email: candidate.email,
          score: match.score,
          roles: match.candidate.roles,
          skills: match.candidate.skills,
          matching_roles: match.matchingRoles,
          matching_skills: match.matchingSkills,
          missing: match.missing,
          reasons: match.reasons,
          components: match.components,
          availability_status: candidate.availability_status || 'open',
          weekly_availability: candidate.weekly_availability || null,
        }
      })
      .filter((match) => match.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)

    return res.status(200).json({
      matches,
      team_coverage: {
        requested_roles: roleSlotNeeds,
        remaining_roles: remainingRoleNeeds,
        filled_roles: Object.fromEntries(filledByRole.entries()),
        core_roles_filled: coreRolesFilled,
        requested_skills: skills,
        existing_team_size: existingTeam.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to calculate matches'
    const status = message === 'Authentication required' ? 401 : message.includes('missing') ? 503 : message.includes('Only') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
