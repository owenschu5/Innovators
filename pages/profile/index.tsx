import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'

const DOMAINS = [
  { id: 'health', label: 'Health', icon: '🏥' },
  { id: 'tech', label: 'Tech', icon: '💻' },
  { id: 'biology', label: 'Biology', icon: '🧬' },
  { id: 'policy', label: 'Policy', icon: '📋' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'environment', label: 'Environment', icon: '🌍' },
  { id: 'finance', label: 'Finance', icon: '💰' },
]

const PROFILE_TYPES = [
  { id: 'builder', label: 'Builder', emoji: '🏗️' },
  { id: 'thinker', label: 'Thinker', emoji: '🧠' },
  { id: 'coder', label: 'Coder', emoji: '⌨️' },
  { id: 'researcher', label: 'Researcher', emoji: '🔬' },
  { id: 'designer', label: 'Designer', emoji: '🎨' },
  { id: 'entrepreneur', label: 'Entrepreneur', emoji: '🚀' },
]

const COMMON_SKILLS = ['React', 'TypeScript', 'Supabase', 'Survey Design', 'Statistics', 'User Research', 'Figma', 'UI Design', 'Systems Thinking', 'Prototyping', 'Market Research', 'Customer Discovery']

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [selectedProfileTypes, setSelectedProfileTypes] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [availabilityStatus, setAvailabilityStatus] = useState('open')
  const [weeklyAvailability, setWeeklyAvailability] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)
  const [dashboardError, setDashboardError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'ideas' | 'groups' | 'requests' | 'contributions'>('overview')

  const loadDashboard = async (authUser: any) => {
    return fetch(`/api/profile-dashboard?user_id=${authUser.id}`)
      .then(response => response.json().then(data => ({ response, data })))
      .then(({ response, data }) => {
        if (response.ok) {
          setDashboard(data)
          setDashboardError('')
        } else {
          setDashboardError(data.error || 'Unable to load dashboard')
        }
      })
      .catch(() => setDashboardError('Unable to load dashboard'))
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/')
        return
      }
      setUser(authUser)

      await loadDashboard(authUser)

      // Fetch user profile
      const resp = await fetch(`/api/users?id=${authUser.id}`)
      if (resp.ok) {
        const json = await resp.json()
        const userProfile = json.user
        if (userProfile.domains) {
          setSelectedDomains(
            userProfile.domains
              .split(',')
              .map((domain: string) => domain.trim().toLowerCase())
              .filter(Boolean)
          )
        }
        if (userProfile.profile_type) {
          setSelectedProfileTypes(
            userProfile.profile_type
              .split(',')
              .map((profileType: string) => profileType.trim().toLowerCase())
              .filter(Boolean)
          )
        }
        if (userProfile.skills) {
          setSelectedSkills(
            userProfile.skills
              .split(',')
              .map((skill: string) => skill.trim())
              .filter(Boolean)
          )
        }
        if (userProfile.availability_status) setAvailabilityStatus(userProfile.availability_status)
        if (userProfile.weekly_availability) setWeeklyAvailability(userProfile.weekly_availability)
      }
      setLoading(false)
    }

    checkAuth()
  }, [router])

  const toggleDomain = (domain: string) => {
    setSelectedDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    )
  }

  const toggleProfileType = (type: string) => {
    setSelectedProfileTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const addSkill = (skill: string) => {
    const cleanSkill = skill.trim()
    if (!cleanSkill) return
    setSelectedSkills(prev => prev.some(item => item.toLowerCase() === cleanSkill.toLowerCase()) ? prev : [...prev, cleanSkill])
    setSkillInput('')
  }

  const removeSkill = (skill: string) => {
    setSelectedSkills(prev => prev.filter(item => item !== skill))
  }

  const respondToInvitation = async (inviteId: string, response: 'accepted' | 'declined') => {
    if (!user) return
    setMessage('')
    try {
      const { data } = await supabase.auth.getSession()
      const resp = await fetch('/api/group-invitations', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ id: inviteId, response }),
      })
      const payload = await resp.json()
      if (!resp.ok) throw new Error(payload.error || 'Unable to update invitation')
      setMessage(response === 'accepted' ? 'Invitation accepted. Project added to your workspace.' : 'Invitation declined.')
      await loadDashboard(user)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update invitation')
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setMessage('')

    try {
      const resp = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          profile_type: selectedProfileTypes.join(','),
          domains: selectedDomains.join(','),
          skills: selectedSkills.join(','),
          availability_status: availabilityStatus,
          weekly_availability: weeklyAvailability,
        }),
      })

      if (resp.ok) {
        setMessage('Profile updated successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        const data = await resp.json().catch(() => null)
        setMessage(data?.error || 'Error updating profile')
      }
    } catch (e) {
      console.error('Save error:', e)
      setMessage('Error updating profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p>Loading profile...</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p>Redirecting...</p>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold mb-2">My Profile</h1>
        <p className="text-gray-600 mb-8">{user.email}</p>

        <div className="mb-8 border-b border-slate-200">
          <div className="flex gap-1 overflow-x-auto pb-3">
            {([['overview','Overview'],['ideas','Ideas'],['groups','Project Groups'],['requests','Requests'],['contributions','Contributions']] as const).map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${activeTab === id ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}{id === 'requests' && dashboard?.invitations?.length ? ` (${dashboard.invitations.length})` : ''}</button>)}
          </div>
        </div>

        {dashboardError && <p className="mb-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{dashboardError}</p>}
        {dashboard && activeTab === 'overview' && <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Ideas created',dashboard.stats.ideasCreated],['Contributions',dashboard.stats.ideasContributed],['Active groups',dashboard.stats.activeGroups],['Pending requests',dashboard.stats.pendingRequests],['Collaborations',dashboard.stats.collaborations]].map(([label,value]) => <button key={String(label)} onClick={() => setActiveTab(label === 'Active groups' ? 'groups' : label === 'Pending requests' ? 'requests' : 'ideas')} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left"><p className="text-2xl font-semibold text-slate-900">{String(value)}</p><p className="mt-1 text-sm text-slate-600">{String(label)}</p></button>)}</div>}
        {dashboard && activeTab === 'ideas' && <DashboardList title="Ideas" empty="No ideas yet. Start exploring problems and create your first idea." items={[...dashboard.createdIdeas.map((idea: any) => ({ title: idea.title, detail: `Creator · ${idea.status || 'active'}`, href: `/ideas/${idea.id}` })), ...dashboard.contributedIdeas.map((idea: any) => ({ title: idea.title, detail: `Contributor · ${idea.status || 'active'}`, href: `/ideas/${idea.id}` }))]} />}
        {dashboard && activeTab === 'groups' && <DashboardList title="Project groups" empty="No active projects. When you form or join one, it will appear here." items={dashboard.memberships.filter((member: any) => member.invitation_status === 'accepted').map((member: any) => ({ title: member.group?.name || 'Project group', detail: `${member.member_role || 'Member'} · ${member.group?.status || member.invitation_status}`, href: member.group?.workspace_active ? `/projects/${member.group_id}` : `/ideas/${member.group?.idea_id}` }))} />}
        {dashboard && activeTab === 'requests' && (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">Requests and invitations</h2>
            <div className="space-y-3">
              {dashboard.invitations.map((invite: any) => (
                <div key={invite.id} className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
                  <p className="font-semibold text-slate-900">Invitation: {invite.group?.name || 'Project group'}</p>
                  <p className="mt-1 text-sm text-slate-600">Proposed role: {invite.member_role || 'Contributor'} · awaiting response</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/ideas/${invite.group?.idea_id}`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300">View Project</Link>
                    <button type="button" onClick={() => void respondToInvitation(invite.id, 'accepted')} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Accept</button>
                    <button type="button" onClick={() => void respondToInvitation(invite.id, 'declined')} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700">Decline</button>
                  </div>
                </div>
              ))}
              {dashboard.requests.map((request: any) => (
                <Link key={request.id} href={`/ideas/${request.idea_id}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-teal-300 hover:bg-teal-50">
                  <p className="font-semibold text-slate-900">{request.group?.name || 'Project request'}</p>
                  <p className="mt-1 text-sm text-slate-600">{request.status || 'pending'}</p>
                </Link>
              ))}
              {!dashboard.invitations.length && !dashboard.requests.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">No pending requests. You&apos;re all caught up.</div> : null}
            </div>
          </section>
        )}
        {dashboard && activeTab === 'contributions' && <DashboardList title="Meaningful contributions" empty="Your ideas and project work will appear here." items={dashboard.activities.map((activity: any) => ({ title: activity.type, detail: activity.label, href: activity.href }))} />}

        {message && (
          <div className={`p-4 rounded mb-6 ${message.includes('success') || message.includes('accepted') || message.includes('declined') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message}
          </div>
        )}

        {/* Domains Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Areas of Interest</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DOMAINS.map(domain => (
              <button
                key={domain.id}
                onClick={() => toggleDomain(domain.id)}
                className={`p-4 rounded-lg border-2 transition text-left ${
                  selectedDomains.includes(domain.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-2">{domain.icon}</div>
                <div className="font-medium text-sm">{domain.label}</div>
                {selectedDomains.includes(domain.id) && (
                  <div className="text-blue-600 text-xs mt-1">✓ Selected</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Profile Types Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Your Roles</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PROFILE_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => toggleProfileType(type.id)}
                className={`p-4 rounded-lg border-2 transition text-left ${
                  selectedProfileTypes.includes(type.id)
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-2">{type.emoji}</div>
                <div className="font-medium text-sm">{type.label}</div>
                {selectedProfileTypes.includes(type.id) && (
                  <div className="text-purple-600 text-xs mt-1">✓ Selected</div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Skills and Availability</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Collaboration availability</span>
              <select value={availabilityStatus} onChange={event => setAvailabilityStatus(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="not_looking">Not looking</option>
                <option value="open">Open to projects</option>
                <option value="actively_looking">Actively looking</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Weekly availability</span>
              <select value={weeklyAvailability} onChange={event => setWeeklyAvailability(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="">Prefer not to say</option>
                <option value="<2">&lt;2 hrs/week</option>
                <option value="2-5">2–5 hrs/week</option>
                <option value="5-10">5–10 hrs/week</option>
                <option value="10+">10+ hrs/week</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={skillInput}
              onChange={event => setSkillInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addSkill(skillInput)
                }
              }}
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              placeholder="Add a skill"
            />
            <button type="button" onClick={() => addSkill(skillInput)} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
              Add
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMMON_SKILLS.filter(skill => !selectedSkills.includes(skill)).slice(0, 8).map(skill => (
              <button key={skill} type="button" onClick={() => addSkill(skill)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                + {skill}
              </button>
            ))}
          </div>
          {selectedSkills.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSkills.map(skill => (
                <button key={skill} type="button" onClick={() => removeSkill(skill)} className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white">
                  {skill} ×
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-4 rounded-lg mb-8">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Interests:</span> {selectedDomains.length > 0 ? selectedDomains.join(', ') : 'None selected'}
          </p>
          <p className="text-sm text-gray-700 mt-2">
            <span className="font-semibold">Roles:</span> {selectedProfileTypes.length > 0 ? selectedProfileTypes.join(', ') : 'None selected'}
          </p>
          <p className="text-sm text-gray-700 mt-2">
            <span className="font-semibold">Skills:</span> {selectedSkills.length > 0 ? selectedSkills.join(', ') : 'None selected'}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link href="/feed" className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">
            Back to Feed
          </Link>
        </div>
      </div>
    </main>
  )
}

function DashboardList({ title, empty, items }: { title: string; empty: string; items: Array<{ title: string; detail: string; href: string }> }) {
  return <section className="mb-8"><h2 className="mb-4 text-xl font-semibold">{title}</h2>{items.length ? <div className="space-y-3">{items.map((item, index) => <Link key={`${item.title}-${index}`} href={item.href} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-teal-300 hover:bg-teal-50"><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.detail}</p></Link>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">{empty}<Link href="/feed" className="ml-2 font-semibold text-teal-700">Explore ideas →</Link></div>}</section>
}
