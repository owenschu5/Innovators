export const MATCH_WEIGHTS = {
  skills: 0,
  roles: 0.5,
  interests: 0.15,
  teamGap: 0.2,
  availability: 0.15,
  contributionExperience: 0,
}

export const SKILL_REFINE_WEIGHTS = {
  skills: 0.35,
  roles: 0.3,
  interests: 0.1,
  teamGap: 0.15,
  availability: 0.1,
  contributionExperience: 0,
}

export const availabilityScores: Record<string, number> = {
  actively_looking: 1,
  open: 0.85,
  open_to_projects: 0.85,
  not_looking: 0.05,
}

export const weeklyAvailabilityRank: Record<string, number> = {
  '<2': 1,
  '2-5': 2,
  '3-5': 2,
  '5-10': 3,
  '10+': 4,
}

export const defaultStageRoleSuggestions: Record<string, string[]> = {
  define: ['thinker', 'researcher', 'entrepreneur'],
  validate: ['researcher', 'thinker', 'entrepreneur'],
  design: ['designer', 'researcher', 'thinker'],
  build: ['coder', 'builder', 'designer'],
  test: ['builder', 'coder', 'researcher'],
  launch: ['entrepreneur', 'designer', 'builder'],
  improve: ['researcher', 'coder', 'designer'],
}
