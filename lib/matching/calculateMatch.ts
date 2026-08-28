import { availabilityScores, defaultStageRoleSuggestions, MATCH_WEIGHTS, SKILL_REFINE_WEIGHTS, weeklyAvailabilityRank } from './scoringConfig'
import { calculateTeamGaps, normalizeToken, splitSignalList, type ProjectNeedSignal, type TeamMemberSignal } from './calculateTeamGaps'

export type CandidateSignal = {
  id: string
  displayName: string
  roles: string[]
  skills: string[]
  interests: string[]
  availabilityStatus?: string | null
  weeklyAvailability?: string | null
  contributionCount?: number
}

export type ProjectSignal = ProjectNeedSignal & {
  interests: string[]
  stage?: string | null
  expectedAvailability?: string | null
  mode?: 'role' | 'skill'
}

export type CandidateMatch = {
  candidate: CandidateSignal
  score: number
  components: {
    skills: number
    roles: number
    interests: number
    teamGap: number
    availability: number
    contributionExperience: number
  }
  matchingRoles: string[]
  matchingSkills: string[]
  missing: string[]
  reasons: string[]
}

function weightedRatio(matched: number, possible: number) {
  if (!possible) return 0.55
  return Math.max(0, Math.min(matched / possible, 1))
}

function priorityWeight(priority: string) {
  if (priority === 'required') return 1.5
  if (priority === 'optional') return 0.6
  return 1
}

function scoreSkills(project: ProjectSignal, candidateSkills: Set<string>) {
  let possible = 0
  let matched = 0
  const matchingSkills: string[] = []
  const missing: string[] = []

  project.skills.forEach((need) => {
    const skill = normalizeToken(need.name)
    const weight = priorityWeight(need.priority)
    possible += weight
    if (candidateSkills.has(skill)) {
      matched += weight
      matchingSkills.push(need.name)
    } else if (need.priority === 'required') {
      missing.push(need.name)
    }
  })

  return { score: weightedRatio(matched, possible), matchingSkills, missing }
}

function scoreRoles(project: ProjectSignal, candidateRoles: Set<string>) {
  let possible = 0
  let matched = 0
  const matchingRoles: string[] = []

  project.roles.forEach((need) => {
    const role = normalizeToken(need.role)
    const weight = priorityWeight(need.priority)
    possible += weight
    if (candidateRoles.has(role)) {
      matched += weight
      matchingRoles.push(role)
    }
  })

  const stageSuggestions = defaultStageRoleSuggestions[normalizeToken(project.stage || '')] || []
  if (!project.roles.length && stageSuggestions.some((role) => candidateRoles.has(role))) return { score: 0.7, matchingRoles }
  return { score: weightedRatio(matched, possible), matchingRoles }
}

function scoreInterests(projectInterests: string[], candidateInterests: Set<string>) {
  const interests = projectInterests.map(normalizeToken).filter(Boolean)
  if (!interests.length) return 0.55
  const matched = interests.filter((interest) => candidateInterests.has(interest)).length
  return weightedRatio(matched, interests.length)
}

function scoreAvailability(project: ProjectSignal, candidate: CandidateSignal) {
  const status = normalizeToken(candidate.availabilityStatus || 'open')
  const statusScore = availabilityScores[status] ?? 0.7
  const expectedRank = weeklyAvailabilityRank[normalizeToken(project.expectedAvailability || '')]
  const candidateRank = weeklyAvailabilityRank[normalizeToken(candidate.weeklyAvailability || '')]
  if (!expectedRank || !candidateRank) return statusScore
  return Math.min(statusScore, candidateRank >= expectedRank ? statusScore : statusScore * 0.72)
}

function scoreTeamGap(project: ProjectSignal, existingTeam: TeamMemberSignal[], candidate: CandidateSignal) {
  const gaps = calculateTeamGaps(project, existingTeam)
  if (!gaps.roleGaps.length && !gaps.skillGaps.length) return 0.55
  const candidateRoles = new Set(candidate.roles.map(normalizeToken))
  const candidateSkills = new Set(candidate.skills.map(normalizeToken))
  const roleHits = gaps.roleGaps.filter((gap) => candidateRoles.has(gap.role)).length
  const skillHits = gaps.skillGaps.filter((gap) => candidateSkills.has(gap.name)).length
  return weightedRatio(roleHits + skillHits, gaps.roleGaps.length + gaps.skillGaps.length)
}

export function calculateCandidateMatch(project: ProjectSignal, candidate: CandidateSignal, existingTeam: TeamMemberSignal[] = []): CandidateMatch {
  const candidateRoles = new Set(candidate.roles.map(normalizeToken))
  const candidateSkills = new Set(candidate.skills.map(normalizeToken))
  const candidateInterests = new Set(candidate.interests.map(normalizeToken))

  const skillResult = scoreSkills(project, candidateSkills)
  const roleResult = scoreRoles(project, candidateRoles)
  const interestScore = scoreInterests(project.interests, candidateInterests)
  const availabilityScore = scoreAvailability(project, candidate)
  const teamGapScore = scoreTeamGap(project, existingTeam, candidate)
  const contributionExperience = Math.min((candidate.contributionCount || 0) / 5, 1)

  const components = {
    skills: skillResult.score * 100,
    roles: roleResult.score * 100,
    interests: interestScore * 100,
    teamGap: teamGapScore * 100,
    availability: availabilityScore * 100,
    contributionExperience: contributionExperience * 100,
  }

  const weights = project.mode === 'skill' ? SKILL_REFINE_WEIGHTS : MATCH_WEIGHTS
  const score = Math.round(
    components.skills * weights.skills +
      components.roles * weights.roles +
      components.interests * weights.interests +
      components.teamGap * weights.teamGap +
      components.availability * weights.availability +
      components.contributionExperience * weights.contributionExperience
  )

  const reasons: string[] = []
  if (roleResult.matchingRoles.length) reasons.push(`Fills open ${roleResult.matchingRoles.map((role) => role.replace(/^\w/, (char) => char.toUpperCase())).join(', ')} role slot`)
  if (project.mode === 'skill' && project.skills.length) reasons.push(`${skillResult.matchingSkills.length} of ${project.skills.length} requested skills matched`)
  if (interestScore > 0.6) reasons.push('Interests align with this idea')
  if (availabilityScore >= 0.8) reasons.push('Availability fits the project expectation')
  if (teamGapScore > 0.6) reasons.push('Helps cover a remaining team gap')
  if (!reasons.length) reasons.push('Partial match based on available profile information')

  return {
    candidate,
    score,
    components,
    matchingRoles: roleResult.matchingRoles,
    matchingSkills: skillResult.matchingSkills,
    missing: skillResult.missing,
    reasons,
  }
}

export function makeProjectSignal(input: {
  roles?: string[]
  roleNeeds?: Array<{ role: string; desiredCount?: number; priority?: 'required' | 'preferred' | 'optional' }>
  skills?: string[]
  interests?: string[]
  stage?: string | null
  expectedAvailability?: string | null
  mode?: 'role' | 'skill'
}): ProjectSignal {
  return {
    roles: input.roleNeeds?.length
      ? input.roleNeeds.map((need) => ({ role: need.role, priority: need.priority || 'required', desiredCount: need.desiredCount || 1 }))
      : (input.roles || []).map((role) => ({ role, priority: 'required' as const, desiredCount: 1 })),
    skills: (input.skills || []).map((name) => ({ name, priority: 'preferred' as const })),
    interests: input.interests || [],
    stage: input.stage || null,
    expectedAvailability: input.expectedAvailability || null,
    mode: input.mode || 'role',
  }
}

export { splitSignalList }
