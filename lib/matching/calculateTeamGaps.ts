export type TeamMemberSignal = {
  roles: string[]
  skills: string[]
}

export type ProjectNeedSignal = {
  roles: Array<{ role: string; priority: 'required' | 'preferred' | 'optional'; desiredCount?: number }>
  skills: Array<{ name: string; priority: 'required' | 'preferred' | 'optional' }>
}

export function normalizeToken(value: string) {
  return value.trim().toLowerCase()
}

export function splitSignalList(value?: string | null) {
  return (value || '')
    .split(',')
    .map(normalizeToken)
    .filter(Boolean)
}

export function calculateTeamGaps(needs: ProjectNeedSignal, existingTeam: TeamMemberSignal[]) {
  const coveredRoles = new Map<string, number>()
  const coveredSkills = new Set<string>()

  existingTeam.forEach((member) => {
    member.roles.map(normalizeToken).forEach((role) => coveredRoles.set(role, (coveredRoles.get(role) || 0) + 1))
    member.skills.map(normalizeToken).forEach((skill) => coveredSkills.add(skill))
  })

  const roleGaps = needs.roles
    .map((need) => {
      const role = normalizeToken(need.role)
      const desiredCount = Math.max(need.desiredCount || 1, 1)
      const covered = coveredRoles.get(role) || 0
      return {
        role,
        priority: need.priority,
        desiredCount,
        covered,
        remaining: Math.max(desiredCount - covered, 0),
      }
    })
    .filter((gap) => gap.remaining > 0)

  const skillGaps = needs.skills
    .map((need) => ({ name: normalizeToken(need.name), priority: need.priority, covered: coveredSkills.has(normalizeToken(need.name)) }))
    .filter((gap) => !gap.covered)

  return { roleGaps, skillGaps, coveredRoles, coveredSkills }
}
