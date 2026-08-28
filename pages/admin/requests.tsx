import type { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getAdminSessionFromCookieHeader } from '../../lib/adminAuth'

type ProjectRequest = {
  id: string
  status: string | null
  created_at: string
  goals: string | null
  outcomes: string | null
  timeline: string | null
  location: string | null
  evidence_data: string | null
  request_notes: string | null
  admin_notes: string | null
  reviewed_at: string | null
  requester_email: string | null
  lead_email: string | null
  idea: {
    id: string
    title: string
  } | null
  group: {
    id: string
    name: string
    lead_name: string | null
    lead_email: string | null
    summary: string | null
    members: Array<{
      member_name: string
      member_email: string
      member_role: string | null
      is_lead: boolean | null
    }>
  } | null
}

type AdminRequestsProps = {
  adminEmail: string
}

const STATUS_OPTIONS = ['pending', 'in_review', 'approved', 'needs_info']

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function getStatusClasses(status: string | null) {
  switch ((status || 'pending').toLowerCase()) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'in_review':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'needs_info':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    default:
      return 'bg-sky-50 text-sky-700 border-sky-200'
  }
}

export default function AdminRequestsPage({ adminEmail }: AdminRequestsProps) {
  const router = useRouter()
  const [requests, setRequests] = useState<ProjectRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    async function loadRequests() {
      try {
        const response = await fetch('/api/project-requests')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load project requests')
        }

        setRequests(data.requests || [])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load project requests')
      } finally {
        setLoading(false)
      }
    }

    loadRequests()
  }, [])

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  async function updateRequestStatus(id: string, status: string, adminNotes: string | null) {
    setSavingId(id)

    try {
      const response = await fetch('/api/project-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status,
          admin_notes: adminNotes || '',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to update request')
      }

      setRequests(current =>
        current.map(request => (request.id === id ? (data.request as ProjectRequest) : request))
      )
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update request')
    } finally {
      setSavingId(null)
    }
  }

  const filteredRequests = requests.filter(request =>
    statusFilter === 'all' ? true : (request.status || 'pending') === statusFilter
  )

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_40%,#fffef8_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-sky-600">Admin dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
                Project move requests
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Review the idea-to-project intake queue. This page only manages requests for
                now so the actual workspaces can come later.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">
                {adminEmail}
              </div>
              <button
                onClick={handleLogout}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {['all', ...STATUS_OPTIONS].map(option => (
              <button
                key={option}
                onClick={() => setStatusFilter(option)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  statusFilter === option
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option === 'all' ? 'All requests' : option.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
            Loading requests...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-rose-700">
            {error}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="mt-6 rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center text-slate-600">
            No project requests match this filter yet.
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {filteredRequests.map(request => (
              <RequestCard
                key={request.id}
                request={request}
                saving={savingId === request.id}
                onSave={updateRequestStatus}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function RequestCard({
  request,
  saving,
  onSave,
}: {
  request: ProjectRequest
  saving: boolean
  onSave: (id: string, status: string, adminNotes: string | null) => Promise<void>
}) {
  const [status, setStatus] = useState(request.status || 'pending')
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || '')

  useEffect(() => {
    setStatus(request.status || 'pending')
    setAdminNotes(request.admin_notes || '')
  }, [request.admin_notes, request.status])

  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getStatusClasses(
                request.status
              )}`}
            >
              {request.status || 'pending'}
            </span>
            <span className="text-sm text-slate-500">Submitted {formatDateTime(request.created_at)}</span>
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            {request.idea?.title || 'Untitled idea'}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Group: <span className="font-medium text-slate-900">{request.group?.name || 'Unassigned group'}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Lead: <span className="font-medium text-slate-900">{request.group?.lead_name || request.lead_email || 'Unknown'}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Requested by: <span className="font-medium text-slate-900">{request.requester_email || 'Unknown'}</span>
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoBlock title="Goals" value={request.goals} />
            <InfoBlock title="Outcomes" value={request.outcomes} />
            <InfoBlock title="Timeline" value={request.timeline} />
            <InfoBlock title="Location" value={request.location} />
            <InfoBlock title="Evidence" value={request.evidence_data} />
            <InfoBlock title="Request notes" value={request.request_notes} />
          </div>

          {request.group?.members?.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Group members
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {request.group.members.map(member => (
                  <div
                    key={`${request.id}-${member.member_email}`}
                    className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-700"
                  >
                    {member.member_name}
                    {member.member_role ? ` • ${member.member_role}` : ''}
                    {member.is_lead ? ' • Lead' : ''}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 xl:w-[320px]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
            <select
              value={status}
              onChange={event => setStatus(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              {STATUS_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Admin notes</span>
            <textarea
              value={adminNotes}
              onChange={event => setAdminNotes(event.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="Capture next steps or decision context"
            />
          </label>

          <button
            onClick={() => onSave(request.id, status, adminNotes)}
            disabled={saving}
            className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? 'Saving...' : 'Save review'}
          </button>

          {request.reviewed_at && (
            <p className="mt-3 text-xs text-slate-500">
              Last reviewed {formatDateTime(request.reviewed_at)}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

function InfoBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {value || 'Not provided yet'}
      </p>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<AdminRequestsProps> = async ({ req }) => {
  const session = getAdminSessionFromCookieHeader(req.headers.cookie)

  if (!session) {
    return {
      redirect: {
        destination: '/admin/login',
        permanent: false,
      },
    }
  }

  return {
    props: {
      adminEmail: session.email,
    },
  }
}
