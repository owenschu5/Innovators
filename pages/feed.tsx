import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FEATURES } from '../lib/features'

type Creator = {
  id: string
  email: string
  profile_type: string
  domains?: string | null
}

type Idea = {
  id: string
  title: string
  description: string
  status: string
  created_at: string
  last_activity?: string | null
  creator_id: string
  creator: Creator
  comment_count: number
  fork_count: number
  role_needs?: RoleNeed[]
}

type RoleNeed = {
  role: string
  desired_count: number
}

type SortOption = 'recommended' | 'latest' | 'active'
type DiscoveryTab = 'for-you' | 'trending' | 'new' | 'needs-collaborators' | 'following'

const SAVED_STORAGE_KEY = 'innovators.savedIdeas'
const FOLLOWING_STORAGE_KEY = 'innovators.followingCreators'
const DISCOVERY_TABS: Array<{ id: DiscoveryTab; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'new', label: 'New' },
  { id: 'needs-collaborators', label: 'Needs People' },
]
const STAGE_FILTERS = ['Exploring', 'Validating', 'Forming a team', 'Building', 'Testing', 'Launched', 'Paused']
const CONTRIBUTION_ROLES = [
  { id: 'builder', label: '🏗️ Builder' },
  { id: 'thinker', label: '🧠 Thinker' },
  { id: 'coder', label: '⌨️ Coder' },
  { id: 'researcher', label: '🔬 Researcher' },
  { id: 'designer', label: '🎨 Designer' },
  { id: 'entrepreneur', label: '🚀 Entrepreneur' },
]
const ROLE_LABELS = Object.fromEntries(CONTRIBUTION_ROLES.map(role => [role.id, role.label]))

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getUserInitials(email: string) {
  return email
    .split('@')[0]
    .split(/[._-]/)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getDisplayName(email: string) {
  if (!email || email.toLowerCase() === 'unknown') return 'Anonymous'
  return email.split('@')[0].replace(/[._-]/g, ' ')
}

function getCreatorInitials(email: string) {
  const displayName = getDisplayName(email)
  if (displayName === 'Anonymous') return 'AN'
  return displayName
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getTagList(value?: string | null) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function getCategoryList(idea: Idea) {
  const domains = getTagList(idea.creator.domains)
  if (domains.length) return domains

  if (idea.creator.email.endsWith('@sample.innovators.local')) {
    return getTagList(idea.creator.profile_type).filter(tag => tag !== 'Sample contributor')
  }

  return []
}

function getStatusClasses(status: string) {
  const normalized = status.toLowerCase()

  if (normalized === 'active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (normalized === 'pending') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (normalized === 'paused') {
    return 'border-slate-200 bg-slate-100 text-slate-700'
  }

  return 'border-sky-200 bg-sky-50 text-sky-800'
}

function getActivityScore(idea: Idea) {
  return idea.comment_count * 2 + (FEATURES.forks ? idea.fork_count * 3 : 0)
}

function normalizeRole(role: string) {
  return role.trim().toLowerCase()
}

function getRoleNeedLabel(role: string) {
  return ROLE_LABELS[normalizeRole(role)] || role
}

function getOpenRoleNeeds(idea: Idea) {
  return (idea.role_needs || [])
    .map(need => ({
      ...need,
      role: normalizeRole(need.role),
      desired_count: Math.max(Number(need.desired_count || 0), 0),
    }))
    .filter(need => need.role && need.desired_count > 0)
}

function getStatusPresentation(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes('forming') || normalized.includes('exploring')) return { label: status || 'Forming a team', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' }
  if (normalized.includes('build') || normalized.includes('development')) return { label: status, className: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' }
  if (normalized.includes('test') || normalized.includes('feedback') || normalized.includes('validat')) return { label: status, className: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' }
  if (normalized.includes('launch') || normalized.includes('complete')) return { label: status, className: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500' }
  return { label: status || 'Active', className: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' }
}

function hasPeopleNeeds(idea: Idea) {
  if (getOpenRoleNeeds(idea).length > 0) return true
  return ['exploring', 'forming a team', 'building'].includes((idea.status || '').toLowerCase())
}

function getIdeaSearchText(idea: Idea) {
  return [
    idea.title,
    idea.description,
    idea.status,
    idea.creator.email,
    idea.creator.profile_type,
    idea.creator.domains,
    ...(idea.role_needs || []).map(need => need.role),
  ]
    .join(' ')
    .toLowerCase()
}

function getShareButtonLabel(ideaId: string, copiedIdeaId: string | null) {
  return copiedIdeaId === ideaId ? 'Copied' : 'Share'
}

export default function Feed() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [discoveryTab, setDiscoveryTab] = useState<DiscoveryTab>('for-you')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortOption>('recommended')
  const [showFilters, setShowFilters] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedIdeas, setSavedIdeas] = useState<Record<string, boolean>>({})
  const [followingCreators, setFollowingCreators] = useState<Record<string, boolean>>({})
  const [copiedIdeaId, setCopiedIdeaId] = useState<string | null>(null)
  const [deletingSampleIdea, setDeletingSampleIdea] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function checkAdminSession() {
      try {
        const response = await fetch('/api/admin/session')
        const data = await response.json()
        setIsAdmin(Boolean(response.ok && data.authenticated))
      } catch {
        setIsAdmin(false)
      }
    }

    checkAdminSession()
  }, [])

  useEffect(() => {
    async function loadIdeas() {
      try {
        setError(null)
        const response = await fetch('/api/ideas')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load ideas right now.')
        }

        setIdeas(data.ideas || [])
      } catch (fetchError) {
        console.error(fetchError)
        setIdeas([])
        setError('The feed could not be loaded right now.')
      }
    }

    loadIdeas()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const saved = window.localStorage.getItem(SAVED_STORAGE_KEY)
      const following = window.localStorage.getItem(FOLLOWING_STORAGE_KEY)

      if (saved) {
        setSavedIdeas(JSON.parse(saved))
      }

      if (following) {
        setFollowingCreators(JSON.parse(following))
      }
    } catch (storageError) {
      console.error('Local feed preferences could not be restored.', storageError)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedIdeas))
  }, [savedIdeas])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(followingCreators))
  }, [followingCreators])

  const allIdeas = ideas || []
  const savedCount = Object.values(savedIdeas).filter(Boolean).length
  const categoryOptions = [
    'all',
    ...Array.from(new Set(allIdeas.flatMap(getCategoryList))).sort(),
  ]
  const statusOptions = [
    'all',
    ...STAGE_FILTERS,
    ...Array.from(
      new Set(
        allIdeas
          .map(idea => idea.status?.trim())
          .filter((status): status is string => Boolean(status) && !STAGE_FILTERS.includes(status))
      )
    ),
  ]

  const normalizedQuery = query.trim().toLowerCase()

  const filteredIdeas = [...allIdeas]
    .filter(idea => {
      if (showSavedOnly && !savedIdeas[idea.id]) return false
      if (statusFilter !== 'all' && idea.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false
      }
      if (categoryFilter !== 'all' && !getCategoryList(idea).includes(categoryFilter)) {
        return false
      }
      if (
        roleFilter !== 'all' &&
        !getOpenRoleNeeds(idea).some(need => need.role === roleFilter)
      ) {
        return false
      }
      if (discoveryTab === 'trending' && !['Testing', 'Launched'].includes(idea.status)) return false
      if (discoveryTab === 'needs-collaborators' && !hasPeopleNeeds(idea)) return false
      if (discoveryTab === 'following' && !followingCreators[idea.creator_id]) return false
      if (normalizedQuery && !getIdeaSearchText(idea).includes(normalizedQuery)) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      if (discoveryTab === 'new') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      if (sortBy === 'active') {
        const activityDiff = getActivityScore(b) - getActivityScore(a)
        if (activityDiff !== 0) return activityDiff
        return (
          new Date(b.last_activity || b.created_at).getTime() -
          new Date(a.last_activity || a.created_at).getTime()
        )
      }

      if (sortBy === 'recommended') {
        const peopleNeedDiff = Number(hasPeopleNeeds(b)) - Number(hasPeopleNeeds(a))
        if (peopleNeedDiff !== 0) return peopleNeedDiff

        const activityDiff = getActivityScore(b) - getActivityScore(a)
        if (activityDiff !== 0) return activityDiff
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const displayedIdeas = discoveryTab === 'new' ? filteredIdeas.slice(0, 20) : filteredIdeas

  async function copyIdeaLink(ideaId: string) {
    if (typeof window === 'undefined') return

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/ideas/${ideaId}`)
      setCopiedIdeaId(ideaId)
      window.setTimeout(() => setCopiedIdeaId(current => (current === ideaId ? null : current)), 1500)
    } catch (copyError) {
      console.error('Unable to copy the idea link.', copyError)
    }
  }

  async function deleteIdea(idea: Idea) {
    if (!window.confirm(`Delete “${idea.title.replace('[Sample] ', '')}”? This cannot be undone.`)) return

    setDeletingSampleIdea(idea.id)
    try {
      const response = await fetch(`/api/ideas?id=${encodeURIComponent(idea.id)}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete the idea.')
      setIdeas(previous => previous?.filter(item => item.id !== idea.id) || [])
    } catch (deleteError) {
      console.error(deleteError)
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the idea.')
    } finally {
      setDeletingSampleIdea(null)
    }
  }

  function clearFilters() {
    setQuery('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setRoleFilter('all')
    setSortBy('recommended')
    setShowSavedOnly(false)
  }

  function toggleSaved(ideaId: string) {
    setSavedIdeas(previous => ({
      ...previous,
      [ideaId]: !previous[ideaId],
    }))
  }

  function toggleFollowing(creatorId: string) {
    setFollowingCreators(previous => ({
      ...previous,
      [creatorId]: !previous[creatorId],
    }))
  }

  const activeFilters = [
    categoryFilter !== 'all' ? { key: 'category', label: categoryFilter, clear: () => setCategoryFilter('all') } : null,
    statusFilter !== 'all' ? { key: 'stage', label: statusFilter, clear: () => setStatusFilter('all') } : null,
    roleFilter !== 'all' ? { key: 'role', label: getRoleNeedLabel(roleFilter), clear: () => setRoleFilter('all') } : null,
    showSavedOnly ? { key: 'saved', label: 'Saved', clear: () => setShowSavedOnly(false) } : null,
    sortBy !== 'recommended' ? { key: 'sort', label: sortBy === 'latest' ? 'Newest' : 'Most active', clear: () => setSortBy('recommended') } : null,
  ].filter((filter): filter is { key: string; label: string; clear: () => void } => Boolean(filter))

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_32%),radial-gradient(circle_at_right,_rgba(45,212,191,0.12),_transparent_30%),linear-gradient(180deg,#fffaf2_0%,#f6f4ee_48%,#eef4f7_100%)]">
      <section className="border-b border-black/5 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.15rem]">
                Discover ideas worth building.
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Find momentum, collaborators, and a project to move forward.
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <Link
                href="/ideas/new"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Share a new idea
              </Link>
              <button
                onClick={() => setShowSavedOnly(current => !current)}
                className={`inline-flex items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  showSavedOnly
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {showSavedOnly ? `Saved ideas (${savedCount})` : 'Saved ideas'}
              </button>
            </div>
          </div>

        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
            {DISCOVERY_TABS.map(tab => {
              const isActive = discoveryTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setDiscoveryTab(tab.id)}
                  className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center md:justify-end">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search ideas</span>
              <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <svg className="mr-3 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search ideas..."
                  className="w-full border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                />
              </div>
            </label>

            <button
              type="button"
              onClick={() => setShowFilters(current => !current)}
              className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                showFilters || activeFilters.length
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
              aria-expanded={showFilters}
            >
              Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
            </button>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map(filter => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={filter.clear}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  {filter.label} ×
                </button>
              ))}

              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800"
              >
                Clear
              </button>
            </div>
          )}

          {showFilters && (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Category</span>
                <select
                  value={categoryFilter}
                  onChange={event => setCategoryFilter(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  {categoryOptions.map(option => (
                    <option key={option} value={option}>
                      {option === 'all' ? 'All' : option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stage</span>
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  {statusOptions.map(option => (
                    <option key={option} value={option}>
                      {option === 'all' ? 'Any stage' : option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Role needed</span>
                <select
                  value={roleFilter}
                  onChange={event => setRoleFilter(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <option value="all">Any role</option>
                  {CONTRIBUTION_ROLES.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sort</span>
                <select
                  value={sortBy}
                  onChange={event => setSortBy(event.target.value as SortOption)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <option value="recommended">Recommended</option>
                  <option value="latest">Newest</option>
                  <option value="active">Most active</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs font-medium text-slate-500">
          {displayedIdeas.length} idea{displayedIdeas.length === 1 ? '' : 's'}
        </p>

        {ideas === null ? (
          <div className="mt-4 grid gap-3">
            {[0, 1, 2].map(index => (
              <div
                key={index}
                className="rounded-3xl border border-black/5 bg-white/75 p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]"
              >
                <div className="animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-slate-200" />
                    <div className="space-y-2">
                      <div className="h-3 w-32 rounded bg-slate-200" />
                      <div className="h-3 w-24 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-5 h-6 w-2/3 rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
            <p className="text-lg font-semibold">The feed is having a moment.</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : displayedIdeas.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white/75 p-8 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-2xl font-semibold text-slate-900">Nothing matches this view yet.</p>
            <p className="mt-3 text-sm text-slate-600">
              Try clearing a filter, searching a broader term, or create the next idea
              yourself.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={clearFilters}
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              >
                Reset filters
              </button>
              <Link
                href="/ideas/new"
                className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Post a new idea
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {displayedIdeas.map(idea => {
              const domainTags = getCategoryList(idea)
              const roleNeeds = getOpenRoleNeeds(idea)
              const visibleRoleNeeds = roleNeeds.slice(0, 3)
              const extraRoleNeeds = roleNeeds.length - visibleRoleNeeds.length
              const isSaved = Boolean(savedIdeas[idea.id])
              const isFollowing = Boolean(followingCreators[idea.creator_id])
              const categoryLabel = domainTags[0] || 'Category not set'
              const statusLabel = idea.status || 'active'
              const status = getStatusPresentation(statusLabel)
              const openRoleCount = roleNeeds.reduce((count, need) => count + need.desired_count, 0)

              return (
                <article
                  key={idea.id}
                  className="rounded-3xl border border-black/5 bg-white/90 px-4 py-4 shadow-[0_20px_55px_-42px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_65px_-44px_rgba(15,23,42,0.55)] sm:px-5"
                >
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0f766e_0%,#f59e0b_100%)] text-xs font-bold text-white shadow-md shadow-amber-100">
                            {getCreatorInitials(idea.creator.email)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {getDisplayName(idea.creator.email)}
                              </p>
                              <button
                                type="button"
                                onClick={() => toggleFollowing(idea.creator_id)}
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-300 ${
                                  isFollowing
                                    ? 'bg-teal-700 text-white'
                                    : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                                }`}
                              >
                                {isFollowing ? 'Following' : 'Follow'}
                              </button>
                              <span className="text-xs text-slate-400">{formatDate(idea.created_at)}</span>
                            </div>
                            <p className="hidden">
                              {categoryLabel} • {statusLabel}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => deleteIdea(idea)}
                              disabled={deletingSampleIdea === idea.id}
                              aria-label="Delete idea"
                              title="Delete idea"
                              className="inline-flex h-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingSampleIdea === idea.id ? 'Deleting…' : 'Delete'}
                            </button>
                          )}
                          <button
                            onClick={() => toggleSaved(idea.id)}
                            aria-label={isSaved ? 'Remove saved idea' : 'Save idea'}
                            title={isSaved ? 'Saved' : 'Save'}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                              isSaved
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <svg className="h-4 w-4" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.8"
                                d="M6 4.75A2.75 2.75 0 018.75 2h6.5A2.75 2.75 0 0118 4.75v16.5l-6-3.5-6 3.5V4.75z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => copyIdeaLink(idea.id)}
                            aria-label="Share idea"
                            title={getShareButtonLabel(idea.id, copiedIdeaId)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            {copiedIdeaId === idea.id ? (
                              <span className="text-[10px] font-semibold">OK</span>
                            ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.8"
                                  d="M7.5 12l9-6v12l-9-6zm0 0H4"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      <Link
                        href={`/ideas/${idea.id}`}
                        className="group mt-3 block rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                      >
                        <h3 className="text-xl font-semibold tracking-tight text-slate-900 transition group-hover:text-teal-700 sm:text-[1.35rem]">
                          {idea.title.replace('[Sample] ', '')}
                        </h3>

                        {idea.description && (
                          <p className="mt-1.5 max-w-3xl line-clamp-2 text-sm leading-5 text-slate-600">
                            {idea.description}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 ring-inset ${status.className}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>
                          {openRoleCount > 0 && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-teal-800">{openRoleCount} role{openRoleCount === 1 ? '' : 's'} open</span>}
                          {idea.comment_count > 0 && <span>💬 {idea.comment_count}</span>}
                          {FEATURES.forks && idea.fork_count > 0 && (
                            <span>{idea.fork_count} fork{idea.fork_count === 1 ? '' : 's'}</span>
                          )}
                          <span>Updated {formatDate(idea.last_activity || idea.created_at)}</span>
                        </div>
                      </Link>
                    </div>
                  </div>

                  {visibleRoleNeeds.length > 0 && (
                    <section className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Open to:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleRoleNeeds.map(need => (
                          <span key={need.role} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                            {getRoleNeedLabel(need.role)} ×{need.desired_count}
                          </span>
                        ))}
                        {extraRoleNeeds > 0 && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            +{extraRoleNeeds} more role{extraRoleNeeds === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </section>
                  )}

                  <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-3">
                    <Link
                      href={`/ideas/${idea.id}`}
                      className="text-sm font-semibold text-teal-700 transition hover:text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                    >
                      View idea →
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
