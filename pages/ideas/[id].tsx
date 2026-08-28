import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'

type Idea = {
  id: string
  title: string
  description: string | null
  status: string | null
  created_at: string
  creator_id: string
}

type Comment = {
  id: string
  idea_id: string
  author_id: string | null
  parent_comment_id: string | null
  content: string
  created_at: string
}

type AuthUser = {
  id: string
  email: string | null
}

type GroupMember = {
  id?: string
  member_name: string
  member_email: string
  member_role: string | null
  is_lead: boolean | null
}

type IdeaGroup = {
  id: string
  idea_id: string
  name: string
  lead_user_id: string | null
  lead_name: string | null
  lead_email: string | null
  summary: string | null
  status: string | null
  created_at: string
  members: GroupMember[]
}

type ProjectRequest = {
  id: string
  status: string | null
  goals: string | null
  outcomes: string | null
  timeline: string | null
  location: string | null
  evidence_data: string | null
  request_notes: string | null
  created_at: string
}

type MatchResult = {
  user_id: string
  display_name: string
  email: string
  score: number
  roles: string[]
  skills: string[]
  matching_roles: string[]
  matching_skills: string[]
  missing: string[]
  reasons: string[]
  availability_status: string
  weekly_availability: string | null
}

type MatchCoverage = {
  requested_roles: Array<{ role: string; desired_count?: number; desiredCount?: number }>
  remaining_roles: Array<{ role: string; desiredCount: number }>
  filled_roles: Record<string, number>
  core_roles_filled: boolean
  requested_skills: string[]
  existing_team_size: number
}

type CommentSort = 'top' | 'recent' | 'unanswered' | 'creator'

type CommentNodeType = Comment & {
  children: CommentNodeType[]
}

function buildTree(flat: Comment[]) {
  const map = new Map<string, CommentNodeType>()
  flat.forEach(comment => map.set(comment.id, { ...comment, children: [] }))
  const roots: CommentNodeType[] = []

  map.forEach(comment => {
    if (comment.parent_comment_id) {
      const parent = map.get(comment.parent_comment_id)
      parent?.children.push(comment)
    } else {
      roots.push(comment)
    }
  })

  return roots
}

function parseMembersText(membersText: string) {
  return membersText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name = '', email = '', role = ''] = line.split('|').map(part => part.trim())
      return { name, email, role }
    })
    .filter(member => member.email)
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

const MATCH_ROLES = ['Researcher', 'Designer', 'Coder', 'Builder', 'Thinker', 'Entrepreneur']
const MATCH_SKILLS = [
  'Survey Design',
  'Statistics',
  'User Research',
  'React',
  'TypeScript',
  'Supabase',
  'Figma',
  'UI Design',
  'Systems Thinking',
  'Prototyping',
  'Market Research',
  'Customer Discovery',
]

export default function IdeaPage() {
  const router = useRouter()
  const { id } = router.query
  const [idea, setIdea] = useState<Idea | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentSort, setCommentSort] = useState<CommentSort>('top')
  const [content, setContent] = useState('')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [groups, setGroups] = useState<IdeaGroup[]>([])
  const [requests, setRequests] = useState<ProjectRequest[]>([])
  const [pathwayMessage, setPathwayMessage] = useState<string | null>(null)
  const [pathwayError, setPathwayError] = useState<string | null>(null)
  const [showProjectPathwayControls, setShowProjectPathwayControls] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [leadName, setLeadName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [groupSummary, setGroupSummary] = useState('')
  const [membersText, setMembersText] = useState('')
  const [requestGoals, setRequestGoals] = useState('')
  const [requestOutcomes, setRequestOutcomes] = useState('')
  const [requestTimeline, setRequestTimeline] = useState('')
  const [requestLocation, setRequestLocation] = useState('')
  const [requestEvidence, setRequestEvidence] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [roleSlotCounts, setRoleSlotCounts] = useState<Record<string, number>>({})
  const [neededSkills, setNeededSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [refineRole, setRefineRole] = useState('coder')
  const [matchStage, setMatchStage] = useState('validate')
  const [expectedAvailability, setExpectedAvailability] = useState('2-5')
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [matchCoverage, setMatchCoverage] = useState<MatchCoverage | null>(null)
  const [matcherMode, setMatcherMode] = useState<'role' | 'skill'>('role')
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [invitingMatch, setInvitingMatch] = useState<string | null>(null)

  useEffect(() => {
    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setCurrentUser({
          id: user.id,
          email: user.email || null,
        })
        setLeadName(previous => previous || user.email?.split('@')[0] || '')
        setLeadEmail(previous => previous || user.email || '')
      }
    }

    loadCurrentUser()
  }, [])

  useEffect(() => {
    if (!id || typeof id !== 'string') return

    async function loadIdeaPage() {
      const [ideaResponse, commentsResponse, groupsResponse, requestsResponse] = await Promise.all([
        fetch(`/api/ideas?id=${id}`),
        fetch(`/api/comments?idea_id=${id}`),
        fetch(`/api/groups?idea_id=${id}`),
        fetch(`/api/project-requests?idea_id=${id}`),
      ])

      const [ideaData, commentsData, groupsData, requestsData] = await Promise.all([
        ideaResponse.json(),
        commentsResponse.json(),
        groupsResponse.json(),
        requestsResponse.json(),
      ])

      setIdea(ideaData.idea || null)
      setComments(commentsData.comments || [])
      setGroups(groupsData.groups || [])
      setRequests(requestsData.requests || [])
    }

    loadIdeaPage()

    const commentsSub = supabase
      .channel('public:idea_comments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'idea_comments', filter: `idea_id=eq.${id}` },
        payload => {
          const newComment = payload.new as Comment
          setComments(prev => [...prev, newComment])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(commentsSub)
    }
  }, [id])

  const primaryGroup = groups[0] || null
  const latestRequest = requests[0] || null
  const currentEmail = currentUser?.email?.trim().toLowerCase() || ''
  const isIdeaCreator = Boolean(currentUser && idea && currentUser.id === idea.creator_id)
  const isGroupLead = Boolean(
    currentUser &&
      primaryGroup &&
      (primaryGroup.lead_user_id === currentUser.id ||
        primaryGroup.lead_email?.trim().toLowerCase() === currentEmail)
  )
  const canSubmitRequest = Boolean(primaryGroup && currentUser && (isIdeaCreator || isGroupLead))
  const canCreateNewRequest =
    canSubmitRequest &&
    (!latestRequest || ['needs_info'].includes((latestRequest.status || '').toLowerCase()))
  const commentTree = buildTree(comments)
  const sortedCommentTree = [...commentTree]
    .filter(comment => {
      if (commentSort === 'unanswered') return comment.children.length === 0
      if (commentSort === 'creator') return idea && comment.author_id === idea.creator_id
      return true
    })
    .sort((a, b) => {
      if (commentSort === 'recent') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      if (commentSort === 'top') {
        const replyDiff = b.children.length - a.children.length
        if (replyDiff !== 0) return replyDiff
      }

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  const refreshPathway = async () => {
    if (!id || typeof id !== 'string') return

    const [groupsResponse, requestsResponse] = await Promise.all([
      fetch(`/api/groups?idea_id=${id}`),
      fetch(`/api/project-requests?idea_id=${id}`),
    ])

    const [groupsData, requestsData] = await Promise.all([
      groupsResponse.json(),
      requestsResponse.json(),
    ])

    setGroups(groupsData.groups || [])
    setRequests(requestsData.requests || [])
  }

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!content.trim()) return

    const user = await supabase.auth.getUser()
    const authorId = user.data?.user?.id || null

    await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_id: id, author_id: authorId, content }),
    })

    setContent('')
  }

  const updateRoleSlotCount = (role: string, delta: number) => {
    setMatcherMode('role')
    setMatchCoverage(null)
    setMatches([])
    setRoleSlotCounts(current => {
      const nextCount = Math.max((current[role] || 0) + delta, 0)
      const next = { ...current }
      if (nextCount) next[role] = nextCount
      else delete next[role]
      return next
    })
  }

  const addNeededSkill = (skill: string) => {
    const cleanSkill = skill.trim()
    if (!cleanSkill) return
    setNeededSkills(current => current.some(item => item.toLowerCase() === cleanSkill.toLowerCase()) ? current : [...current, cleanSkill])
    setSkillInput('')
  }

  const removeNeededSkill = (skill: string) => {
    setNeededSkills(current => current.filter(item => item !== skill))
  }

  const findCollaborators = async () => {
    if (!id || typeof id !== 'string') return
    const roleNeeds = Object.entries(roleSlotCounts).map(([role, desired_count]) => ({ role, desired_count }))
    if (!roleNeeds.length) {
      setMatchError('Choose at least one role slot first.')
      return
    }
    if (matcherMode === 'skill' && (!refineRole || !neededSkills.length)) {
      setMatchError('Choose a role and at least one skill to refine.')
      return
    }

    setMatching(true)
    setMatchError('')
    try {
      const { data } = await supabase.auth.getSession()
      const response = await fetch(`/api/ideas/${id}/matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({
          group_id: primaryGroup?.id || null,
          role_needs: roleNeeds,
          skills: matcherMode === 'skill' ? neededSkills : [],
          match_mode: matcherMode,
          refine_role: refineRole,
          stage: matchStage,
          expected_availability: expectedAvailability,
          proposed_members: parseMembersText(membersText),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to find collaborators')
      setMatches(payload.matches || [])
      setMatchCoverage(payload.team_coverage || null)
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'Unable to find collaborators')
    } finally {
      setMatching(false)
    }
  }

  const addMatchToDraft = (match: MatchResult) => {
    const role = match.matching_roles[0] || refineRole || match.roles[0] || 'Contributor'
    const line = `${match.display_name} | ${match.email} | ${role}`
    setMembersText(current => {
      if (current.toLowerCase().includes(match.email.toLowerCase())) return current
      return current.trim() ? `${current.trim()}\n${line}` : line
    })
  }

  const inviteMatch = async (match: MatchResult) => {
    if (!primaryGroup || !currentUser) return
    setInvitingMatch(match.user_id)
    setMatchError('')
    try {
      const response = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: primaryGroup.id,
          actor_id: currentUser.id,
          user_id: match.user_id,
          member_role: match.matching_roles[0] || match.roles[0] || 'Contributor',
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to invite collaborator')
      setPathwayMessage(`${match.display_name} was invited to the project group.`)
      setMatches(current => current.filter(item => item.user_id !== match.user_id))
      await refreshPathway()
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'Unable to invite collaborator')
    } finally {
      setInvitingMatch(null)
    }
  }

  const handleCreateGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!id || typeof id !== 'string' || !currentUser) {
      setPathwayError('You need to be logged in before forming a project group.')
      return
    }

    setCreatingGroup(true)
    setPathwayError(null)
    setPathwayMessage(null)

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_id: id,
          created_by: currentUser.id,
          name: groupName,
          lead_name: leadName,
          lead_email: leadEmail,
          summary: groupSummary,
          members: parseMembersText(membersText),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to form the project group')
      }

      setPathwayMessage('Project group formed. You can now request a move to the project platform.')
      setGroupName('')
      setGroupSummary('')
      setMembersText('')
      await refreshPathway()
    } catch (groupError) {
      setPathwayError(groupError instanceof Error ? groupError.message : 'Unable to form the project group')
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleSubmitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!id || typeof id !== 'string' || !currentUser || !primaryGroup) {
      setPathwayError('You need a group before submitting a project request.')
      return
    }

    setSubmittingRequest(true)
    setPathwayError(null)
    setPathwayMessage(null)

    try {
      const response = await fetch('/api/project-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_id: id,
          group_id: primaryGroup.id,
          requested_by: currentUser.id,
          goals: requestGoals,
          outcomes: requestOutcomes,
          timeline: requestTimeline,
          location: requestLocation,
          evidence_data: requestEvidence,
          request_notes: requestNotes,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit the project request')
      }

      setPathwayMessage('Project request submitted for admin review.')
      setRequestGoals('')
      setRequestOutcomes('')
      setRequestTimeline('')
      setRequestLocation('')
      setRequestEvidence('')
      setRequestNotes('')
      await refreshPathway()
    } catch (requestError) {
      setPathwayError(
        requestError instanceof Error ? requestError.message : 'Unable to submit the project request'
      )
    } finally {
      setSubmittingRequest(false)
    }
  }

  const renderMatcher = () => (
    <div className="rounded-[1.5rem] border border-teal-100 bg-teal-50/60 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Auto Matcher</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Role Coverage first</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Choose which Innovators contribution roles this project needs and how many seats are open. Skills unlock after the required role slots are filled.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void findCollaborators()}
          disabled={matching || !Object.values(roleSlotCounts).some(Boolean) || (matcherMode === 'skill' && !neededSkills.length)}
          className="rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {matching ? 'Finding...' : matcherMode === 'skill' ? 'Find Skill Matches' : 'Find Role Matches'}
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Contribution role slots</p>
          <div className="flex flex-wrap gap-2">
            {MATCH_ROLES.map(role => (
              <button
                key={role}
                type="button"
                onClick={() => updateRoleSlotCount(role, roleSlotCounts[role] >= 3 ? -roleSlotCounts[role] : 1)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  roleSlotCounts[role] ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {role}{roleSlotCounts[role] ? ` × ${roleSlotCounts[role]}` : ''}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Click a role to cycle 1, 2, 3, then back to not required.</p>
        </div>

        <div className={matchCoverage?.core_roles_filled ? '' : 'opacity-60'}>
          <p className="mb-2 text-sm font-semibold text-slate-700">Skill Gaps / Refine Team</p>
          {!matchCoverage?.core_roles_filled ? <p className="mb-3 text-sm text-slate-600">Fill every required role slot first. Then skills can refine the team inside a role.</p> : null}
          {matchCoverage?.core_roles_filled ? (
          <>
          <label className="mb-3 block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Refine role</span>
            <select value={refineRole} onChange={event => setRefineRole(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900">
              {MATCH_ROLES.map(role => <option key={role} value={role.toLowerCase()}>{role}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <input
              value={skillInput}
              onChange={event => setSkillInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addNeededSkill(skillInput)
                }
              }}
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-200"
              placeholder="React, Survey Design, Figma..."
            />
            <button type="button" onClick={() => { setMatcherMode('skill'); addNeededSkill(skillInput) }} className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Add
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {MATCH_SKILLS.filter(skill => !neededSkills.includes(skill)).slice(0, 8).map(skill => (
              <button key={skill} type="button" onClick={() => { setMatcherMode('skill'); addNeededSkill(skill) }} className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white">
                + {skill}
              </button>
            ))}
          </div>
          {neededSkills.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {neededSkills.map(skill => (
                <button key={skill} type="button" onClick={() => removeNeededSkill(skill)} className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white">
                  {skill} ×
                </button>
              ))}
            </div>
          ) : null}
          </>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Project stage</span>
          <select value={matchStage} onChange={event => setMatchStage(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900">
            {['define', 'validate', 'design', 'build', 'test', 'launch', 'improve'].map(stage => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Expected commitment</span>
          <select value={expectedAvailability} onChange={event => setExpectedAvailability(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900">
            <option value="<2">&lt;2 hrs/week</option>
            <option value="2-5">2–5 hrs/week</option>
            <option value="5-10">5–10 hrs/week</option>
            <option value="10+">10+ hrs/week</option>
          </select>
        </label>
      </div>

      {matchError ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{matchError}</p> : null}

      {matches.length ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Best matches</p>
          {matches.map(match => (
            <div key={match.user_id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{match.display_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{match.roles.length ? match.roles.join(' • ') : 'Contributor'}{match.weekly_availability ? ` • ${match.weekly_availability} hrs/week` : ''}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-2xl font-bold text-teal-700">{match.score}%</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">match</p>
                </div>
              </div>
              {match.matching_skills.length ? <p className="mt-3 text-sm text-slate-700"><span className="font-semibold">Skills matched:</span> {match.matching_skills.join(', ')}</p> : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Why this matches</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {match.reasons.map(reason => <li key={reason}>✓ {reason}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Missing</p>
                  <p className="mt-2 text-sm text-slate-600">{match.missing.length ? match.missing.join(', ') : 'No required gaps flagged'}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {primaryGroup ? (
                  <button
                    type="button"
                    disabled={invitingMatch === match.user_id}
                    onClick={() => void inviteMatch(match)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {invitingMatch === match.user_id ? 'Inviting...' : 'Invite'}
                  </button>
                ) : (
                  <button type="button" onClick={() => addMatchToDraft(match)} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    Add to proposed team
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fffaf2_0%,#f8fbff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/feed" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Back to feed
        </Link>

        {!idea ? (
          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            Loading idea...
          </div>
        ) : (
          <>
            <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {idea.status || 'active'}
                </span>
                <span className="text-sm text-slate-500">Posted {formatDateTime(idea.created_at)}</span>
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
                {idea.title}
              </h1>
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-base leading-8 text-slate-600">
                {idea.description || 'No description added yet.'}
              </p>
            </section>

            <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] sm:p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Project pathway
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Comments are for discussing the idea. Project groups are a separate step for
                    people ready to organize execution.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {latestRequest && (
                    <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                      Latest request: {latestRequest.status || 'pending'}
                    </div>
                  )}
                  {currentUser && !primaryGroup && (
                    <button
                      type="button"
                      onClick={() => setShowProjectPathwayControls(current => !current)}
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                    >
                      Start a project group
                    </button>
                  )}
                  {currentUser && primaryGroup && (
                    <button
                      type="button"
                      onClick={() => setShowProjectPathwayControls(current => !current)}
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                    >
                      {showProjectPathwayControls ? 'Hide project actions' : 'Show project actions'}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">Project group pathway</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Following or commenting does not add you to a project group. Use this pathway
                  only when a team is ready to define roles, a lead, and a project request.
                </p>
              </div>

              {(pathwayMessage || pathwayError) && (
                <div
                  className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
                    pathwayError
                      ? 'border border-rose-200 bg-rose-50 text-rose-700'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {pathwayError || pathwayMessage}
                </div>
              )}

              {!currentUser && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Log in with your member account to form a group or submit a project request.
                </div>
              )}

              {primaryGroup ? (
                <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Project group
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold text-slate-900">{primaryGroup.name}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        Lead: {primaryGroup.lead_name || primaryGroup.lead_email || 'Not assigned yet'}
                      </p>
                      {primaryGroup.summary && (
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                          {primaryGroup.summary}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                      Formed {formatDateTime(primaryGroup.created_at)}
                    </div>
                  </div>

                  {primaryGroup.status === 'approved' && currentUser && (
                    <Link
                      href={`/projects/${primaryGroup.id}`}
                      className="mt-5 inline-flex rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                    >
                      Open project workspace
                    </Link>
                  )}

                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Members
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {primaryGroup.members.map(member => (
                        <div
                          key={member.member_email}
                          className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          {member.member_name}
                          {member.member_role ? ` • ${member.member_role}` : ''}
                          {member.is_lead ? ' • Lead' : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : currentUser && showProjectPathwayControls ? (
                <form onSubmit={handleCreateGroup} className="mt-6 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-700">Group name</span>
                      <input
                        value={groupName}
                        onChange={event => setGroupName(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Prototype lab team"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-700">Lead name</span>
                      <input
                        value={leadName}
                        onChange={event => setLeadName(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Team lead name"
                        required
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="mb-2 block text-sm font-medium text-slate-700">Lead email</span>
                      <input
                        value={leadEmail}
                        onChange={event => setLeadEmail(event.target.value)}
                        type="email"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="lead@example.com"
                        required
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Group summary</span>
                    <textarea
                      value={groupSummary}
                      onChange={event => setGroupSummary(event.target.value)}
                      rows={4}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="What this team is trying to validate or build."
                    />
                  </label>

                  {renderMatcher()}

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Members</span>
                    <textarea
                      value={membersText}
                      onChange={event => setMembersText(event.target.value)}
                      rows={5}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder={'One per line: name | email | role\nAlex Chen | alex@example.com | Builder'}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      The idea poster or the chosen lead can create this group.
                    </p>
                  </label>

                  <button
                    type="submit"
                    disabled={creatingGroup}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creatingGroup ? 'Forming group...' : 'Form project group'}
                  </button>
                </form>
              ) : null}

              {primaryGroup && showProjectPathwayControls && (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <div className="mb-8">
                    {renderMatcher()}
                  </div>

                  <h3 className="text-xl font-semibold text-slate-900">Request move to project platform</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Once the team is aligned, the idea poster or the group lead can submit this
                    for admin review.
                  </p>

                  {latestRequest && (
                    <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {latestRequest.status || 'pending'}
                        </span>
                        <span className="text-sm text-slate-500">
                          Submitted {formatDateTime(latestRequest.created_at)}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <InfoBlock title="Goals" value={latestRequest.goals} />
                        <InfoBlock title="Outcomes" value={latestRequest.outcomes} />
                        <InfoBlock title="Timeline" value={latestRequest.timeline} />
                        <InfoBlock title="Location" value={latestRequest.location} />
                      </div>
                    </div>
                  )}

                  {canCreateNewRequest ? (
                    <form onSubmit={handleSubmitRequest} className="mt-6 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-slate-700">Goals</span>
                          <textarea
                            value={requestGoals}
                            onChange={event => setRequestGoals(event.target.value)}
                            rows={4}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="What does this team need to accomplish first?"
                            required
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-slate-700">Expected outcomes</span>
                          <textarea
                            value={requestOutcomes}
                            onChange={event => setRequestOutcomes(event.target.value)}
                            rows={4}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="Prototype, research packet, validation sprint, and so on."
                            required
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-slate-700">Timeline</span>
                          <input
                            value={requestTimeline}
                            onChange={event => setRequestTimeline(event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="6-week sprint"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-slate-700">Location</span>
                          <input
                            value={requestLocation}
                            onChange={event => setRequestLocation(event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="Remote / hybrid / campus lab"
                          />
                        </label>
                      </div>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Evidence or readiness notes</span>
                        <textarea
                          value={requestEvidence}
                          onChange={event => setRequestEvidence(event.target.value)}
                          rows={4}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          placeholder="Links, notes, validation, research, or traction signals."
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Request notes</span>
                        <textarea
                          value={requestNotes}
                          onChange={event => setRequestNotes(event.target.value)}
                          rows={3}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          placeholder="Anything the admin team should know before opening a project space."
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={submittingRequest}
                        className="rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {submittingRequest ? 'Submitting request...' : 'Submit project request'}
                      </button>
                    </form>
                  ) : primaryGroup && !canSubmitRequest ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Only the original idea poster or the assigned group lead can submit the
                      project request.
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)] sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Comments</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Full discussion stays here. Replies are grouped under top-level comments.
                  </p>
                </div>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700">Sort discussion</span>
                  <select
                    value={commentSort}
                    onChange={event => setCommentSort(event.target.value as CommentSort)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  >
                    <option value="top">Top</option>
                    <option value="recent">Recent</option>
                    <option value="unanswered">Unanswered</option>
                    <option value="creator">Creator updates</option>
                  </select>
                </label>
              </div>
              <form onSubmit={submitComment} className="mt-4">
                <textarea
                  value={content}
                  onChange={event => setContent(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 p-4 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  rows={4}
                  placeholder="Add your thoughts to the discussion"
                />
                <button className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                  Reply
                </button>
              </form>

              <div className="mt-6 space-y-4">
                {sortedCommentTree.map(comment => (
                  <CommentNode key={comment.id} node={comment} />
                ))}
                {sortedCommentTree.length === 0 && (
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No comments match this view yet.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function CommentNode({ node }: { node: CommentNodeType }) {
  return (
    <div className="pl-3">
      <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{node.content}</p>
        <p className="mt-2 text-xs text-slate-500">{formatDateTime(node.created_at)}</p>
      </div>
      {node.children.length > 0 && (
        <div className="mt-3 space-y-3 border-l border-slate-200 pl-4">
          {node.children.map(child => (
            <CommentNode key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  )
}

function InfoBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {value || 'Not provided yet'}
      </p>
    </div>
  )
}
