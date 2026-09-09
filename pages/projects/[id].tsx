import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import type { OnMount } from '@monaco-editor/react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'
import BuildWithAiPanel, { type AiChangeSet, type AiFileChange, type AiMode, type AiRun } from '../../components/BuildWithAiPanel'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

type Node = {
  id: string
  parent_id: string | null
  name: string
  node_type: 'file' | 'folder'
  content?: string | null
  version: number
}

type WorkspaceTab = 'overview' | 'work' | 'discuss' | 'build'
type BuildPane = 'files' | 'editor' | 'ai'
type WorkFilter = 'objectives' | 'tasks'
type NewWorkItem = 'objective' | 'task'
type Objective = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  stage: string | null
  owner_id: string | null
  created_at: string
}
type ProjectTask = {
  id: string
  objective_id: string | null
  title: string
  description: string | null
  status: string
  priority: string
  suggested_role: string | null
  stage: string | null
  assigned_to: string | null
  created_at: string
}
type ProjectMember = {
  id: string
  user_id: string | null
  member_name: string | null
  member_email: string | null
  member_role: string | null
  permissions: string | null
  is_lead: boolean | null
  invitation_status?: string | null
  created_at?: string | null
  user?: { id: string; email: string | null; profile_type: string | null } | null
}
type TeamCoverage = {
  role: string
  required: number
  filled: number
  invited: number
  open: number
}
type MemberCandidate = {
  id: string
  display_name: string
  username: string
  roles: string[]
  domains: string[]
  availability_status: string
  weekly_availability: string | null
  open_role_matches: string[]
  already_in_project: boolean
  score: number
}
type WorkspaceOverview = {
  project: { id: string; name: string; summary: string | null }
  workspace: { id: string; name: string; current_stage?: string | null; goals?: string | null; problem_statement?: string | null }
  idea: { id: string; title: string | null; description: string | null; problem_statement?: string | null; goals?: string | null } | null
  member: { permissions: string | null; member_role: string | null; is_lead: boolean | null }
  members: ProjectMember[]
  objectives: Objective[]
  tasks: ProjectTask[]
  activity: Array<{ id: string; event_type: string; metadata: any; created_at: string }>
  userProfile?: { id: string; email: string | null; profile_type: string | null } | null
}
type ProjectRoom = {
  id: string
  workspace_id: string
  name: string
  slug: string
  description: string | null
  type: 'general' | 'announcement' | 'role' | 'objective' | 'custom'
  role_type: string | null
  objective_id: string | null
  unread_count?: number
  last_read_at?: string | null
  last_message_at?: string | null
}
type WorkspaceMessage = {
  id: string
  room_id: string
  workspace_id: string
  user_id: string
  content: string
  parent_message_id: string | null
  created_at: string
  edited_at?: string | null
  user?: { id: string; email: string | null; profile_type: string | null } | null
}

type MonacoEditorInstance = Parameters<OnMount>[0]
type MonacoNamespace = Parameters<OnMount>[1]

const collabUrl = process.env.NEXT_PUBLIC_COLLAB_URL || 'ws://localhost:1234'
const workspaceTabs: WorkspaceTab[] = ['overview', 'work', 'discuss', 'build']
const workFilters: WorkFilter[] = ['objectives', 'tasks']
const stages = ['define', 'validate', 'design', 'build', 'test', 'launch', 'improve']
const contributionRoles = ['any', 'thinker', 'researcher', 'designer', 'coder', 'builder', 'entrepreneur']

const roleLabels: Record<string, string> = {
  any: 'Any contributor',
  builder: 'Builder',
  thinker: 'Thinker',
  coder: 'Coder',
  researcher: 'Researcher',
  designer: 'Designer',
  entrepreneur: 'Entrepreneur',
}

const roleEmoji: Record<string, string> = {
  builder: '🏗️',
  thinker: '🧠',
  coder: '⌨️',
  researcher: '🔬',
  designer: '🎨',
  entrepreneur: '🚀',
}

const workspaceSurface = 'rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-xl shadow-slate-950/20 backdrop-blur'
const workspaceInset = 'rounded-xl border border-slate-800/80 bg-slate-950/70'
const workspaceField =
  'w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:ring-1 focus:ring-teal-400'
const workspaceSelect =
  'w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-teal-400 focus:ring-1 focus:ring-teal-400'
const primaryAction =
  'rounded-xl bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryAction =
  'rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
const mutedPill = 'rounded-full border border-slate-700/80 bg-slate-950/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400'
const activePill = 'rounded-full border border-teal-400/40 bg-teal-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-200'

function languageFor(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() || ''
  return (
    {
      css: 'css',
      html: 'html',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      py: 'python',
      sql: 'sql',
      ts: 'typescript',
      tsx: 'typescript',
    } as Record<string, string>
  )[extension] || 'plaintext'
}

function colorFor(value: string) {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 72% 58%)`
}

export default function ProjectWorkspace() {
  const router = useRouter()
  const id = typeof router.query.id === 'string' ? router.query.id : ''
  const [nodes, setNodes] = useState<Node[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [mobileBuildPane, setMobileBuildPane] = useState<BuildPane>('editor')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiRuns, setAiRuns] = useState<AiRun[]>([])
  const [aiChangeSets, setAiChangeSets] = useState<AiChangeSet[]>([])
  const [aiFileChanges, setAiFileChanges] = useState<AiFileChange[]>([])
  const [connectionStatus, setConnectionStatus] = useState('Offline')
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('overview')
  const [activeWorkFilter, setActiveWorkFilter] = useState<WorkFilter>('objectives')
  const [newWorkItem, setNewWorkItem] = useState<NewWorkItem | null>(null)
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [objectiveForm, setObjectiveForm] = useState({ title: '', description: '', priority: 'medium', stage: 'define' })
  const [taskForm, setTaskForm] = useState({ title: '', description: '', objective_id: '', suggested_role: 'any', assigned_to: '', priority: 'medium' })
  const [rooms, setRooms] = useState<ProjectRoom[]>([])
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [roomsError, setRoomsError] = useState('')
  const [roomsBusy, setRoomsBusy] = useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<WorkspaceMessage | null>(null)
  const [teamPanelOpen, setTeamPanelOpen] = useState(false)
  const [addMembersOpen, setAddMembersOpen] = useState(false)
  const [teamCoverage, setTeamCoverage] = useState<TeamCoverage[]>([])
  const [teamCanManage, setTeamCanManage] = useState(false)
  const [memberCandidates, setMemberCandidates] = useState<MemberCandidate[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberRoleFilter, setMemberRoleFilter] = useState('')
  const [inviteRole, setInviteRole] = useState('researcher')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamError, setTeamError] = useState('')

  const providerRef = useRef<{ destroy: () => void } | null>(null)
  const bindingRef = useRef<{ destroy: () => void } | null>(null)
  const docRef = useRef<any | null>(null)
  const activeFileRef = useRef<string | null>(null)

  const open = useMemo(() => nodes.find((node) => node.id === openId) || null, [nodes, openId])
  const folders = useMemo(() => nodes.filter((node) => node.node_type === 'folder'), [nodes])
  const roomWorkspaceId = rooms[0]?.workspace_id || overview?.workspace.id || null
  const pathForNode = useCallback(
    (node: Node | null): string => {
      if (!node) return ''
      const segments = [node.name]
      let parentId = node.parent_id
      while (parentId) {
        const parent = nodes.find((item) => item.id === parentId)
        if (!parent) break
        segments.unshift(parent.name)
        parentId = parent.parent_id
      }
      return segments.join('/')
    },
    [nodes]
  )

  useEffect(() => {
    activeFileRef.current = openId
  }, [openId])

  const cleanupCollaboration = useCallback(() => {
    bindingRef.current?.destroy()
    providerRef.current?.destroy()
    docRef.current?.destroy()
    bindingRef.current = null
    providerRef.current = null
    docRef.current = null
    setCollaborators([])
  }, [])

  const request = useCallback(
    async (method: string, body?: unknown) => {
      const { data } = await supabase.auth.getSession()
      const response = await fetch(`/api/projects/${id}/files`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Workspace operation failed')
      return payload
    },
    [id]
  )

  const aiRequest = useCallback(
    async (method: string, body?: unknown) => {
      const { data } = await supabase.auth.getSession()
      const response = await fetch(`/api/projects/${id}/ai`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'AI workspace operation failed')
      return payload
    },
    [id]
  )

  const workspaceRequest = useCallback(
    async (method: string, body?: unknown) => {
      const { data } = await supabase.auth.getSession()
      const response = await fetch(`/api/projects/${id}/workspace`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Workspace operation failed')
      return payload
    },
    [id]
  )

  const roomsRequest = useCallback(
    async (method: string, body?: unknown, roomId?: string | null) => {
      const { data } = await supabase.auth.getSession()
      const path = roomId ? `/api/projects/${id}/rooms?room_id=${encodeURIComponent(roomId)}` : `/api/projects/${id}/rooms`
      const response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Rooms operation failed')
      return payload
    },
    [id]
  )

  const membersRequest = useCallback(
    async (method: string, body?: unknown, query?: Record<string, string>) => {
      const { data } = await supabase.auth.getSession()
      const search = query ? `?${new URLSearchParams(query).toString()}` : ''
      const response = await fetch(`/api/projects/${id}/members${search}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Team operation failed')
      return payload
    },
    [id]
  )

  const load = useCallback(async () => {
    if (!id) return
    try {
      setError('')
      const payload = await request('GET')
      setNodes(payload.nodes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workspace')
    }
  }, [id, request])

  useEffect(() => {
    void load()
  }, [load])

  const loadOverview = useCallback(async () => {
    if (!id) return
    try {
      const payload = await workspaceRequest('GET')
      setOverview(payload)
      setWorkspaceError('')
      setObjectiveForm((current) => ({ ...current, stage: payload.workspace?.current_stage || 'define' }))
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to load project overview')
    }
  }, [id, workspaceRequest])

  const loadTeam = useCallback(
    async (query?: Record<string, string>) => {
      if (!id) return
      try {
        setTeamError('')
        const payload = await membersRequest('GET', undefined, query)
        setTeamCoverage(payload.coverage || [])
        setTeamCanManage(Boolean(payload.can_manage))
        if (payload.candidates) setMemberCandidates(payload.candidates)
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to load team management')
      }
    },
    [id, membersRequest]
  )

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  const markRoomRead = useCallback(
    async (roomId: string) => {
      if (!id || !roomId) return
      try {
        await roomsRequest('PATCH', { action: 'read', room_id: roomId })
        const readAt = new Date().toISOString()
        setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, unread_count: 0, last_read_at: readAt } : room)))
      } catch {
        // Unread state should never block reading the room.
      }
    },
    [id, roomsRequest]
  )

  const loadRooms = useCallback(
    async (roomId?: string | null) => {
      if (!id) return
      try {
        setRoomsError('')
        const payload = await roomsRequest('GET', undefined, roomId || activeRoomId)
        setRooms(payload.rooms || [])
        setMessages(payload.messages || [])
        const nextRoomId = payload.active_room_id || roomId || activeRoomId || null
        setActiveRoomId(nextRoomId)
        if (nextRoomId && activeWorkspaceTab === 'discuss') void markRoomRead(nextRoomId)
      } catch (err) {
        setRoomsError(err instanceof Error ? err.message : 'Unable to load project discussions')
      }
    },
    [activeRoomId, activeWorkspaceTab, id, markRoomRead, roomsRequest]
  )

  useEffect(() => {
    if (id) void loadRooms()
  }, [id, loadRooms])

  useEffect(() => {
    if (!roomWorkspaceId) return
    const channel = supabase
      .channel(`workspace-rooms:${roomWorkspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_messages', filter: `workspace_id=eq.${roomWorkspaceId}` },
        (payload) => {
          const next = payload.new as WorkspaceMessage
          if (next.room_id === activeRoomId && activeWorkspaceTab === 'discuss') {
            void loadRooms(activeRoomId)
            void markRoomRead(activeRoomId)
          } else {
            setRooms((current) =>
              current.map((room) =>
                room.id === next.room_id
                  ? {
                      ...room,
                      unread_count: (room.unread_count || 0) + 1,
                      last_message_at: next.created_at,
                    }
                  : room
              )
            )
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspace_rooms', filter: `workspace_id=eq.${roomWorkspaceId}` },
        () => void loadRooms(activeRoomId)
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeRoomId, activeWorkspaceTab, loadRooms, markRoomRead, roomWorkspaceId])

  useEffect(() => {
    if (activeWorkspaceTab === 'discuss' && activeRoomId) void markRoomRead(activeRoomId)
  }, [activeRoomId, activeWorkspaceTab, markRoomRead])

  const loadAi = useCallback(async () => {
    if (!id) return
    try {
      const payload = await aiRequest('GET')
      setAiRuns(payload.runs || [])
      setAiChangeSets(payload.changeSets || [])
      setAiFileChanges(payload.fileChanges || [])
      setAiError('')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to load AI activity')
    }
  }, [aiRequest, id])

  useEffect(() => {
    void loadAi()
  }, [loadAi])

  useEffect(() => cleanupCollaboration, [cleanupCollaboration])

  useEffect(() => {
    cleanupCollaboration()
    setConnectionStatus(openId ? 'Connecting' : 'Offline')
  }, [cleanupCollaboration, openId])

  const openFile = useCallback((node: Node) => {
    if (node.node_type !== 'file') return
    setTabs((current) => (current.includes(node.id) ? current : [...current, node.id]))
    setOpenId(node.id)
    setMobileBuildPane('editor')
    setError('')
  }, [])

  const closeTab = useCallback(
    (nodeId: string) => {
      setTabs((current) => {
        const next = current.filter((item) => item !== nodeId)
        if (openId === nodeId) setOpenId(next[next.length - 1] || null)
        return next
      })
    },
    [openId]
  )

  const chooseParent = useCallback(() => {
    if (!folders.length) return null
    const names = folders.map((folder) => folder.name).join(', ')
    const picked = window.prompt(`Folder name for parent, or leave blank for root. Folders: ${names}`)
    if (!picked) return null
    return folders.find((folder) => folder.name === picked)?.id || null
  }, [folders])

  const createNode = useCallback(
    async (nodeType: 'file' | 'folder') => {
      const example = nodeType === 'file' ? 'README.md' : 'src'
      const name = window.prompt(nodeType === 'file' ? 'File name (for example, README.md or index.ts)' : 'Folder name', example)?.trim()
      if (!name) return
      if (nodeType === 'file' && !name.includes('.')) {
        setError('Use a filename with an extension, such as README.md or index.ts.')
        return
      }
      setBusy(true)
      try {
        const parentId = chooseParent()
        const payload = await request('POST', { name, node_type: nodeType, parent_id: parentId })
        setNodes((current) => [...current, payload.node])
        if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }))
        if (nodeType === 'file') openFile(payload.node)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed')
      } finally {
        setBusy(false)
      }
    },
    [chooseParent, openFile, request]
  )

  const rename = useCallback(
    async (node: Node) => {
      const name = window.prompt('New name', node.name)
      if (!name || name === node.name) return
      try {
        const payload = await request('PATCH', { node_id: node.id, name })
        setNodes((current) => current.map((item) => (item.id === node.id ? payload.node : item)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rename failed')
      }
    },
    [request]
  )

  const remove = useCallback(
    async (node: Node) => {
      if (!window.confirm(`Delete ${node.name}?`)) return
      try {
        await request('DELETE', { node_id: node.id })
        if (node.id === openId) setOpenId(null)
        setTabs((current) => current.filter((item) => item !== node.id))
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
      }
    },
    [load, openId, request]
  )

  const submitAiPrompt = useCallback(
    async (mode: AiMode, prompt: string) => {
      setAiBusy(true)
      setAiError('')
      try {
        const payload = await aiRequest('POST', { mode: mode === 'change' ? 'edit' : mode, prompt, active_file_id: openId })
        setAiRuns((current) => [payload.run, ...current.filter((run) => run.id !== payload.run.id)])
        if (payload.changeSet) {
          setAiChangeSets((current) => [payload.changeSet, ...current.filter((changeSet) => changeSet.id !== payload.changeSet.id)])
          setAiFileChanges((current) => [
            ...(payload.fileChanges || []),
            ...current.filter((change) => change.change_set_id !== payload.changeSet.id),
          ])
        }
        return true
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'AI request failed')
        return false
      } finally {
        setAiBusy(false)
      }
    },
    [aiRequest, openId]
  )

  const applyOpenYjsChange = useCallback(
    (changes: AiFileChange[]) => {
      if (!openId || !docRef.current) return
      const openChange = changes.find((change) => change.file_id === openId && change.operation === 'modify')
      if (!openChange || typeof openChange.proposed_content !== 'string') return
      const text = docRef.current.getText?.('monaco')
      if (!text) return
      docRef.current.transact?.(() => {
        text.delete(0, text.length)
        text.insert(0, openChange.proposed_content || '')
      })
    },
    [openId]
  )

  const acceptAiChangeSet = useCallback(
    async (changeSetId: string) => {
      setAiBusy(true)
      setAiError('')
      try {
        const payload = await aiRequest('PATCH', { action: 'accept', change_set_id: changeSetId })
        applyOpenYjsChange((payload.appliedChanges || []) as AiFileChange[])
        setAiChangeSets((current) => current.map((changeSet) => (changeSet.id === changeSetId ? payload.changeSet : changeSet)))
        await load()
        await loadAi()
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Unable to accept AI changes')
      } finally {
        setAiBusy(false)
      }
    },
    [aiRequest, applyOpenYjsChange, load, loadAi]
  )

  const rejectAiChangeSet = useCallback(
    async (changeSetId: string) => {
      setAiBusy(true)
      setAiError('')
      try {
        const payload = await aiRequest('PATCH', { action: 'reject', change_set_id: changeSetId })
        setAiChangeSets((current) => current.map((changeSet) => (changeSet.id === changeSetId ? payload.changeSet : changeSet)))
        await loadAi()
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Unable to reject AI changes')
      } finally {
        setAiBusy(false)
      }
    },
    [aiRequest, loadAi]
  )

  const updateStage = useCallback(
    async (stage: string) => {
      setWorkspaceBusy(true)
      setWorkspaceError('')
      try {
        const payload = await workspaceRequest('PATCH', { action: 'stage', stage })
        setOverview((current) => (current ? { ...current, workspace: payload.workspace } : current))
        await loadOverview()
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Unable to update stage')
      } finally {
        setWorkspaceBusy(false)
      }
    },
    [loadOverview, workspaceRequest]
  )

  const createObjective = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!objectiveForm.title.trim()) return false
      setWorkspaceBusy(true)
      setWorkspaceError('')
      try {
        await workspaceRequest('POST', { type: 'objective', ...objectiveForm })
        setObjectiveForm({ title: '', description: '', priority: 'medium', stage: overview?.workspace.current_stage || 'define' })
        await loadOverview()
        return true
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Unable to create objective')
        return false
      } finally {
        setWorkspaceBusy(false)
      }
    },
    [loadOverview, objectiveForm, overview?.workspace.current_stage, workspaceRequest]
  )

  const createTask = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!taskForm.title.trim()) return false
      setWorkspaceBusy(true)
      setWorkspaceError('')
      try {
        await workspaceRequest('POST', { type: 'task', ...taskForm, objective_id: taskForm.objective_id || null, stage: overview?.workspace.current_stage || 'define' })
        setTaskForm({ title: '', description: '', objective_id: '', suggested_role: 'any', assigned_to: '', priority: 'medium' })
        await loadOverview()
        return true
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'Unable to create task')
        return false
      } finally {
        setWorkspaceBusy(false)
      }
    },
    [loadOverview, overview?.workspace.current_stage, taskForm, workspaceRequest]
  )

  const refreshTeam = useCallback(async () => {
    await Promise.all([loadOverview(), loadTeam()])
  }, [loadOverview, loadTeam])

  const searchMembers = useCallback(
    async (matches = false) => {
      setTeamBusy(true)
      setTeamError('')
      try {
        const query: Record<string, string> = {}
        if (memberSearch.trim()) query.q = memberSearch.trim()
        if (memberRoleFilter) query.role = memberRoleFilter
        if (matches) query.matches = '1'
        const payload = await membersRequest('GET', undefined, query)
        setTeamCoverage(payload.coverage || [])
        setTeamCanManage(Boolean(payload.can_manage))
        setMemberCandidates(payload.candidates || [])
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to search people')
      } finally {
        setTeamBusy(false)
      }
    },
    [memberRoleFilter, memberSearch, membersRequest]
  )

  const inviteCandidate = useCallback(
    async (candidate: MemberCandidate) => {
      const role = inviteRole || candidate.open_role_matches[0] || candidate.roles[0]
      if (!role) {
        setTeamError('Choose a contribution role before inviting.')
        return
      }
      setTeamBusy(true)
      setTeamError('')
      try {
        await membersRequest('POST', { user_id: candidate.id, member_role: role, message: inviteMessage })
        setInviteMessage('')
        setMemberCandidates((current) => current.filter((item) => item.id !== candidate.id))
        await refreshTeam()
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to send invitation')
      } finally {
        setTeamBusy(false)
      }
    },
    [inviteMessage, inviteRole, membersRequest, refreshTeam]
  )

  const inviteByEmail = useCallback(async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) {
      setTeamError('Enter the Google/email address to invite.')
      return
    }
    if (!inviteRole) {
      setTeamError('Choose a contribution role before inviting.')
      return
    }
    setTeamBusy(true)
    setTeamError('')
    try {
      await membersRequest('POST', { member_email: email, member_role: inviteRole, message: inviteMessage })
      setInviteEmail('')
      setInviteMessage('')
      await refreshTeam()
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : 'Unable to send email invitation')
    } finally {
      setTeamBusy(false)
    }
  }, [inviteEmail, inviteMessage, inviteRole, membersRequest, refreshTeam])

  const updateRoleNeed = useCallback(
    async (role: string, desiredCount: number) => {
      setTeamBusy(true)
      setTeamError('')
      try {
        await membersRequest('PATCH', { action: 'role_needs', role, desired_count: desiredCount })
        await refreshTeam()
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to update role needs')
      } finally {
        setTeamBusy(false)
      }
    },
    [membersRequest, refreshTeam]
  )

  const cancelInvitation = useCallback(
    async (memberId: string) => {
      setTeamBusy(true)
      setTeamError('')
      try {
        await membersRequest('PATCH', { action: 'cancel_invitation', member_id: memberId })
        await refreshTeam()
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to cancel invitation')
      } finally {
        setTeamBusy(false)
      }
    },
    [membersRequest, refreshTeam]
  )

  const removeMember = useCallback(
    async (member: ProjectMember) => {
      const name = member.member_name || member.user?.email || member.member_email || 'this member'
      if (
        !window.confirm(
          `Remove ${name} from this project?\n\nThey will lose access to the Project Workspace, Rooms, files, and private activity. Historical contributions stay attributed to them.`
        )
      ) {
        return
      }
      setTeamBusy(true)
      setTeamError('')
      try {
        await membersRequest('PATCH', { action: 'remove_member', member_id: member.id })
        await refreshTeam()
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to remove member')
      } finally {
        setTeamBusy(false)
      }
    },
    [membersRequest, refreshTeam]
  )

  const updateMemberRole = useCallback(
    async (member: ProjectMember, role: string) => {
      setTeamBusy(true)
      setTeamError('')
      try {
        await membersRequest('PATCH', { action: 'update_member', member_id: member.id, member_role: role })
        await refreshTeam()
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to update member role')
      } finally {
        setTeamBusy(false)
      }
    },
    [membersRequest, refreshTeam]
  )

  const leaveProject = useCallback(async () => {
    if (!window.confirm('Leave this project? You will lose access to its workspace, rooms, files, and private activity.')) return
    setTeamBusy(true)
    setTeamError('')
    try {
      await membersRequest('PATCH', { action: 'leave_project' })
      router.push('/profile')
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : 'Unable to leave project')
    } finally {
      setTeamBusy(false)
    }
  }, [membersRequest, router])

  const selectRoom = useCallback(
    async (roomId: string) => {
      setActiveRoomId(roomId)
      setReplyingTo(null)
      await loadRooms(roomId)
      void markRoomRead(roomId)
    },
    [loadRooms, markRoomRead]
  )

  const sendRoomMessage = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!messageDraft.trim() || !activeRoomId) return
      setRoomsBusy(true)
      setRoomsError('')
      try {
        const payload = await roomsRequest('POST', {
          type: 'message',
          room_id: activeRoomId,
          content: messageDraft,
          parent_message_id: replyingTo?.id || null,
        })
        setMessages((current) => (current.some((message) => message.id === payload.message.id) ? current : [...current, payload.message]))
        setMessageDraft('')
        setReplyingTo(null)
        setRooms((current) =>
          current.map((room) => (room.id === activeRoomId ? { ...room, last_message_at: payload.message.created_at, unread_count: 0 } : room))
        )
        void markRoomRead(activeRoomId)
      } catch (err) {
        setRoomsError(err instanceof Error ? err.message : 'Unable to send message')
      } finally {
        setRoomsBusy(false)
      }
    },
    [activeRoomId, markRoomRead, messageDraft, replyingTo?.id, roomsRequest]
  )

  const createCustomRoom = useCallback(async () => {
    const name = window.prompt('Custom room name')
    if (!name) return
    setRoomsBusy(true)
    setRoomsError('')
    try {
      const payload = await roomsRequest('POST', { type: 'room', name })
      setRooms((current) => [...current.filter((room) => room.id !== payload.room.id), payload.room])
      await selectRoom(payload.room.id)
    } catch (err) {
      setRoomsError(err instanceof Error ? err.message : 'Unable to create room')
    } finally {
      setRoomsBusy(false)
    }
  }, [roomsRequest, selectRoom])

  const bindEditor = useCallback(
    async (editor: MonacoEditorInstance, monaco: MonacoNamespace) => {
      if (!open || !id) return
      cleanupCollaboration()

      const fileId = open.id
      const model = editor.getModel()
      if (!model) return

      try {
        const [{ HocuspocusProvider }, { MonacoYjsBinding }, Y] = await Promise.all([
          import('@hocuspocus/provider'),
          import('../../lib/monacoYjsBinding'),
          import('yjs'),
        ])
        const { data } = await supabase.auth.getSession()
        const session = data.session
        if (!session?.access_token) throw new Error('Sign in to join the workspace')
        const token = session.access_token
        if (activeFileRef.current !== fileId) return

        const ydoc = new Y.Doc()
        const name = session.user.email || session.user.id
        const provider = new HocuspocusProvider({
          url: collabUrl,
          name: `workspace:${id}:file:${fileId}`,
          document: ydoc,
          token,
          flushDelay: 50,
          onAuthenticated: () => setConnectionStatus('Authenticated'),
          onAuthenticationFailed: ({ reason }) => {
            setConnectionStatus('Blocked')
            setError(reason)
          },
          onAwarenessChange: ({ states }) => {
            const names = states
              .map((state) => state.user?.name)
              .filter((value): value is string => typeof value === 'string' && value.length > 0)
            setCollaborators(Array.from(new Set(names)))
          },
          onStatus: ({ status }) => setConnectionStatus(status),
          onSynced: ({ state }) => setConnectionStatus(state ? 'Live' : 'Syncing'),
          onUnsyncedChanges: ({ number }) => {
            if (number > 0) setConnectionStatus('Saving')
          },
        })

        provider.setAwarenessField('user', { name, color: colorFor(name) })
        const binding = new MonacoYjsBinding(monaco, ydoc.getText('monaco'), model, new Set([editor]), provider.awareness)
        docRef.current = ydoc
        providerRef.current = provider
        bindingRef.current = binding
      } catch (err) {
        setConnectionStatus('Offline')
        setError(err instanceof Error ? err.message : 'Unable to connect collaboration server')
      }
    },
    [cleanupCollaboration, id, open]
  )

  const renderTree = useCallback(
    (parentId: string | null, depth = 0): ReactNode =>
      nodes
        .filter((node) => node.parent_id === parentId)
        .map((node) => {
          const isFolder = node.node_type === 'folder'
          const isOpen = node.id === openId
          return (
            <div key={node.id}>
              <div className="group flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
                <button
                  type="button"
                  onClick={() => (isFolder ? setExpanded((current) => ({ ...current, [node.id]: !current[node.id] })) : openFile(node))}
                  className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left text-sm transition ${
                    isOpen ? 'bg-teal-400 text-slate-950' : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="mr-1 opacity-70">{isFolder ? (expanded[node.id] ? '▾' : '›') : '•'}</span>
                  <span className="truncate align-bottom">{node.name}</span>
                </button>
                <button type="button" onClick={() => rename(node)} className="hidden rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 group-hover:block">
                  Rename
                </button>
                <button type="button" onClick={() => remove(node)} className="hidden rounded-lg px-2 py-1 text-xs text-rose-300 hover:bg-rose-950 group-hover:block">
                  Delete
                </button>
              </div>
              {isFolder && expanded[node.id] ? renderTree(node.id, depth + 1) : null}
            </div>
          )
        }),
    [expanded, nodes, openFile, openId, remove, rename]
  )

  const userRoles = useMemo(
    () =>
      (overview?.userProfile?.profile_type || '')
        .split(',')
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean),
    [overview?.userProfile?.profile_type]
  )
  const openTasks = overview?.tasks.filter((task) => task.status !== 'complete') || []
  const recommendedTasks = openTasks
    .filter((task) => {
      const role = (task.suggested_role || 'any').toLowerCase()
      return role === 'any' || userRoles.includes(role)
    })
    .slice(0, 5)
  const completedTasks = overview?.tasks.filter((task) => task.status === 'complete').length || 0
  const progress = overview?.tasks.length ? Math.round((completedTasks / overview.tasks.length) * 100) : 0
  const currentStage = overview?.workspace.current_stage || 'define'
  const allProjectMembers = overview?.members || []
  const teamMembers = allProjectMembers.filter((member) => member.invitation_status === 'accepted')
  const pendingInvitations = allProjectMembers.filter((member) => member.invitation_status === 'invited')
  const inactiveMemberships = allProjectMembers.filter((member) => ['left', 'removed', 'cancelled', 'declined'].includes(member.invitation_status || ''))
  const canManageTeam = teamCanManage || Boolean(overview?.member.is_lead || ['project_lead', 'lead', 'owner', 'admin'].includes(overview?.member.permissions || ''))
  const roleNeedsSummary = teamCoverage.filter((item) => item.required > 0)
  const filledRequiredRoles = roleNeedsSummary.filter((item) => item.filled >= item.required).length
  const currentMember = teamMembers.find((member) => member.user_id === overview?.userProfile?.id)
  const hasActiveWork = Boolean((overview?.objectives.length || 0) + (overview?.tasks.length || 0))
  const meaningfulActivity = overview?.activity.slice(0, 4) || []
  const presenceLabel = collaborators.length
    ? collaborators.join(', ')
    : `${teamMembers.length || 1} member${(teamMembers.length || 1) === 1 ? '' : 's'}`
  const activeRoom = rooms.find((room) => room.id === activeRoomId) || rooms[0] || null
  const totalUnread = rooms.reduce((sum, room) => sum + (room.unread_count || 0), 0)
  const yourRooms = rooms.filter((room) => room.type === 'role' && room.role_type && userRoles.includes(room.role_type))
  const projectRooms = rooms.filter((room) => ['general', 'announcement', 'custom'].includes(room.type))
  const roleRooms = rooms.filter((room) => room.type === 'role' && !yourRooms.some((yourRoom) => yourRoom.id === room.id))
  const objectiveRooms = rooms.filter((room) => room.type === 'objective')
  const rootMessages = messages.filter((message) => !message.parent_message_id)
  const repliesByParent = useMemo(() => {
    const grouped: Record<string, WorkspaceMessage[]> = {}
    messages
      .filter((message) => message.parent_message_id)
      .forEach((message) => {
        const parentId = message.parent_message_id as string
        grouped[parentId] = [...(grouped[parentId] || []), message]
      })
    return grouped
  }, [messages])

  const objectiveTaskCount = useCallback(
    (objectiveId: string) => overview?.tasks.filter((task) => task.objective_id === objectiveId).length || 0,
    [overview?.tasks]
  )

  const renderOverview = () => (
    <section className="min-h-[calc(100vh-129px)] overflow-auto p-6">
      {workspaceError ? <div className="mb-4 rounded-xl border border-rose-900/80 bg-rose-950/60 p-3 text-sm text-rose-200">{workspaceError}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className={`${workspaceSurface} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Project summary</p>
        <h1 className="mt-2 max-w-4xl text-2xl font-semibold text-white">{overview?.project.name || 'Project workspace'}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          {overview?.idea?.description || overview?.project.summary || 'Add an objective or task to begin organizing this project.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={activePill}>{currentStage}</span>
          <span className={mutedPill}>{progress}% complete</span>
        </div>
        {currentStage === 'validate' ? <p className="mt-3 text-xs text-teal-200/80">Validate: define the problem, gather evidence, test assumptions, and get feedback.</p> : null}

        </div>
        <div className={`${workspaceSurface} p-5`}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Next steps</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setActiveWorkspaceTab('work'); setNewWorkItem('objective') }} className={primaryAction}>Create objective</button>
            <button type="button" onClick={() => { setActiveWorkspaceTab('work'); setNewWorkItem('task') }} className={secondaryAction}>Create task</button>
            <button type="button" onClick={() => setActiveWorkspaceTab('discuss')} className={secondaryAction}>Start discussion</button>
            {canManageTeam ? <button type="button" onClick={() => setAddMembersOpen(true)} className={secondaryAction}>Invite member</button> : null}
          </div>
        {!hasActiveWork ? (
          <div className="mt-4 rounded-xl border border-teal-400/25 bg-teal-400/10 p-4">
            <p className="text-lg font-semibold text-white">Let’s start turning this idea into a project.</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Create the first objective, open a team discussion, or invite collaborators. No need to stare at empty dashboards.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspaceTab('work')
                  setNewWorkItem('objective')
                }}
                className={primaryAction}
              >
                Create First Objective
              </button>
              <button type="button" onClick={() => setActiveWorkspaceTab('discuss')} className={secondaryAction}>
                Start Discussion
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className={`${workspaceSurface} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Current focus</p>
            <button
              type="button"
              onClick={() => {
                setActiveWorkspaceTab('work')
                setActiveWorkFilter('objectives')
              }}
              className="text-sm font-semibold text-teal-300 hover:text-teal-200"
            >
              Open Work
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {(overview?.objectives || []).filter((objective) => objective.status !== 'complete').slice(0, 3).map((objective) => (
              <ObjectiveCard key={objective.id} objective={objective} taskCount={objectiveTaskCount(objective.id)} compact />
            ))}
            {hasActiveWork && !overview?.objectives.length ? (
              openTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} />)
            ) : null}
            {!hasActiveWork ? <p className="text-sm text-slate-400">No active objective or task yet.</p> : null}
          </div>
        </div>

        <div className={`${workspaceSurface} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Team</p>
              <p className="mt-1 text-xs text-slate-500">
                {teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}
                {pendingInvitations.length ? ` • ${pendingInvitations.length} pending` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              {canManageTeam ? (
                <button type="button" onClick={() => setAddMembersOpen(true)} className={primaryAction}>
                  + Add Members
                </button>
              ) : null}
              <button type="button" onClick={() => setTeamPanelOpen(true)} className={secondaryAction}>
                View Team
              </button>
            </div>
          </div>
          {roleNeedsSummary.length ? (
            <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Open team roles</p>
              <div className="mt-3 space-y-2">
                {roleNeedsSummary.slice(0, 4).map((item) => (
                  <div key={item.role} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-300">{roleEmoji[item.role] || ''} {roleLabels[item.role] || item.role}</span>
                    <span className={item.open ? mutedPill : activePill}>
                      {item.filled} / {item.required}{item.invited ? ` • ${item.invited} invited` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {teamMembers.slice(0, 5).map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{member.member_name || member.user?.email || member.member_email}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{roleSummary(member.user?.profile_type || member.member_role) || member.permissions || 'Contributor'}</p>
                </div>
                {member.is_lead ? <span className={activePill}>Lead</span> : null}
              </div>
            ))}
            {!teamMembers.length ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-4">
                <p className="text-sm font-semibold text-white">Build your team</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">You’re currently the only member. Add people who can help move this project forward.</p>
                {canManageTeam ? (
                  <button type="button" onClick={() => setAddMembersOpen(true)} className={`${primaryAction} mt-3`}>
                    Add Members
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className={`${workspaceSurface} p-5`}>
            <p className="text-sm font-semibold text-white">Important open tasks</p>
          <div className="mt-4 space-y-3">
            {recommendedTasks.length ? (
              recommendedTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{roleLabels[(task.suggested_role || 'any').toLowerCase()] || task.suggested_role}</p>
                  </div>
                  <span className={mutedPill}>{task.priority}</span>
                </div>
              ))
            ) : (
              <ul className="space-y-2 text-sm leading-6 text-slate-400">
                <li>• Define the first objective</li>
                <li>• Discuss what needs to happen next</li>
                <li>• Invite collaborators into the project</li>
              </ul>
            )}
          </div>
        </div>

        <div className={`${workspaceSurface} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Recent activity</p>
            <button type="button" onClick={() => setActiveWorkspaceTab('discuss')} className="text-sm font-semibold text-teal-300 hover:text-teal-200">
              {totalUnread ? `${totalUnread} unread discussion${totalUnread === 1 ? '' : 's'}` : 'Open Discuss'}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {meaningfulActivity.map((item) => (
              <div key={item.id} className="text-sm text-slate-300">
                <p>{item.event_type.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-xs text-slate-600">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            ))}
            {!meaningfulActivity.length && totalUnread ? <p className="text-sm text-slate-400">{totalUnread} unread room message{totalUnread === 1 ? '' : 's'}.</p> : null}
            {!meaningfulActivity.length && !totalUnread ? <p className="text-sm text-slate-400">No recent project activity yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  )

  const renderWork = () => {
    const showObjectives = activeWorkFilter === 'objectives'
    const taskType = (task: ProjectTask) => {
      const role = (task.suggested_role || 'any').toLowerCase()
      return ({ researcher: 'Research', designer: 'Design', coder: 'Engineering', builder: 'Testing', thinker: 'Documentation', entrepreneur: 'Outreach', any: 'General' } as Record<string, string>)[role] || 'General'
    }
    const taskAssignee = (task: ProjectTask) => {
      const member = teamMembers.find((item) => item.user_id === task.assigned_to)
      return member?.member_name || member?.user?.email || member?.member_email || 'Unassigned'
    }

    return (
      <section className="min-h-[calc(100vh-112px)] overflow-auto p-5">
        {workspaceError ? <div className="mb-4 rounded-xl border border-rose-900/80 bg-rose-950/60 p-3 text-sm text-rose-200">{workspaceError}</div> : null}

        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Work</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">Project execution</h1>
              <p className="mt-1 text-sm text-slate-400">Objectives set direction. Tasks move the project forward.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {workFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveWorkFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition ${
                  activeWorkFilter === filter
                    ? 'bg-teal-400 text-slate-950'
                    : 'border border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
            <button type="button" onClick={() => setNewWorkItem('objective')} className={`${primaryAction} ml-1`}>
              + New
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {showObjectives ? (overview?.objectives || []).map((objective) => (
            <article key={objective.id} className={`${workspaceSurface} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-base font-semibold text-white">{objective.title}</p><p className="mt-1 text-sm text-slate-400">{objective.description || 'No description yet.'}</p></div><div className="flex gap-2"><span className={mutedPill}>{objective.status}</span><span className={activePill}>{objective.priority}</span></div></div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{objectiveTaskCount(objective.id)} linked tasks</span><span>Stage: {objective.stage || currentStage}</span></div>
            </article>
          )) : (overview?.tasks || []).map((task) => (
            <article key={task.id} className={`${workspaceSurface} flex flex-wrap items-center justify-between gap-3 p-4`}><div className="min-w-0"><p className="text-sm font-semibold text-white">{task.title}</p><p className="mt-1 text-xs text-slate-500">{taskType(task)} · {overview?.objectives.find((objective) => objective.id === task.objective_id)?.title || 'No objective'} · {taskAssignee(task)}</p></div><div className="flex gap-2"><span className={mutedPill}>{task.status}</span><span className={activePill}>{task.priority}</span></div></article>
          ))}
          {showObjectives && !overview?.objectives.length ? <p className={`${workspaceSurface} p-4 text-sm text-slate-400`}>No objectives yet. Use + New to define the first outcome.</p> : null}
          {!showObjectives && !overview?.tasks.length ? <p className={`${workspaceSurface} p-4 text-sm text-slate-400`}>No tasks yet. Use + New to add the next piece of work.</p> : null}
        </div>
      </section>
    )
  }

  const renderRooms = () => {
    const renderRoomButton = (room: ProjectRoom) => (
      <button
        key={room.id}
        type="button"
        onClick={() => void selectRoom(room.id)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
          activeRoom?.id === room.id
            ? 'border-teal-400/60 bg-teal-400/10 text-teal-100'
            : 'border-slate-800/80 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70'
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{room.name}</span>
          {room.description ? <span className="mt-0.5 block truncate text-xs text-slate-500">{room.description}</span> : null}
        </span>
        {room.unread_count ? <span className="rounded-full bg-teal-400 px-2 py-0.5 text-xs font-bold text-slate-950">{room.unread_count}</span> : null}
      </button>
    )

    return (
      <section className="min-h-[calc(100vh-129px)] overflow-hidden p-4">
        {roomsError ? <div className="mb-4 rounded-xl border border-rose-900/80 bg-rose-950/60 p-3 text-sm text-rose-200">{roomsError}</div> : null}
        <div className="grid min-h-[calc(100vh-161px)] grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={`${workspaceSurface} min-h-[320px] overflow-hidden p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Discuss</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Team conversations</h2>
              </div>
              {totalUnread ? <span className="rounded-full bg-teal-400 px-2.5 py-1 text-xs font-bold text-slate-950">{totalUnread}</span> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Project-wide and topic conversations stay connected to this project.
            </p>

            <div className="mt-5 space-y-5 overflow-auto pr-1">
              {yourRooms.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Your rooms</p>
                  <div className="space-y-2">{yourRooms.map(renderRoomButton)}</div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Project</p>
                  <button type="button" disabled={roomsBusy} onClick={() => void createCustomRoom()} className="text-xs font-semibold text-teal-300 hover:text-teal-200 disabled:opacity-60">
                    New discussion
                  </button>
                </div>
                <div className="space-y-2">{projectRooms.map(renderRoomButton)}</div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Topic / role rooms</p>
                <div className="space-y-2">{roleRooms.map(renderRoomButton)}</div>
              </div>

              {objectiveRooms.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Objectives</p>
                  <div className="space-y-2">{objectiveRooms.map(renderRoomButton)}</div>
                </div>
              ) : null}
            </div>
          </aside>

          <section className={`${workspaceSurface} flex min-h-[520px] min-w-0 flex-col overflow-hidden`}>
            {activeRoom ? (
              <>
                <div className="border-b border-slate-800/80 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                        {activeRoom.type === 'role' && activeRoom.role_type ? `${roleEmoji[activeRoom.role_type] || ''} ${roleLabels[activeRoom.role_type] || activeRoom.role_type}` : activeRoom.type}
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">{activeRoom.name}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{activeRoom.description || 'Project discussion room.'}</p>
                    </div>
                    <span className={activeRoom.type === 'announcement' ? activePill : mutedPill}>
                      {activeRoom.type === 'announcement' ? 'lead updates' : `${rootMessages.length} messages`}
                    </span>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {rootMessages.length ? (
                    <div className="space-y-4">
                      {rootMessages.map((message) => (
                        <MessageCard
                          key={message.id}
                          message={message}
                          replies={repliesByParent[message.id] || []}
                          onReply={() => setReplyingTo(message)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid min-h-[360px] place-items-center text-center">
                      <div>
                        <p className="text-lg font-semibold text-slate-300">Start the room</p>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                          Ask a question, share a finding, or coordinate the next project move. This is where conversation starts turning into work.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={sendRoomMessage} className="border-t border-slate-800/80 bg-slate-950/40 p-4">
                  {replyingTo ? (
                    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-teal-400/30 bg-teal-400/10 p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-200">Replying to {displayName(replyingTo)}</p>
                        <p className="mt-1 truncate text-sm text-slate-300">{replyingTo.content}</p>
                      </div>
                      <button type="button" onClick={() => setReplyingTo(null)} className="text-sm text-slate-400 hover:text-white">
                        Clear
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    rows={3}
                    className={`${workspaceField} resize-none`}
                    placeholder={activeRoom.type === 'announcement' ? 'Post an important project update...' : 'Message the project team... try @researchers, @coders, or @team'}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Phase 1 supports realtime messages, replies, and unread counts. Mentions become notifications in the next slice.</p>
                    <button type="submit" disabled={roomsBusy || !messageDraft.trim()} className={primaryAction}>
                      {roomsBusy ? 'Sending...' : 'Send message'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-slate-300">Discussions unavailable</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Run the Project Rooms migration, then reload to enable project and topic conversations.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    )
  }

  const renderPlaceholder = (label: string) => (
    <section className="min-h-[calc(100vh-129px)] overflow-auto p-6">
      <div className={`${workspaceSurface} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Coming next</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{label} Workspace</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          This area will hold {label.toLowerCase()}-specific artifacts. For now, use Objectives for work planning, Rooms for discussion, and Build for implementation.
        </p>
      </div>
    </section>
  )

  const renderActivity = () => (
    <section className="min-h-[calc(100vh-129px)] overflow-auto p-6">
      <div className={`${workspaceSurface} p-5`}>
        <p className="text-sm font-semibold text-white">Recent Activity</p>
        <div className="mt-4 space-y-3">
          {(overview?.activity || []).map((item) => (
            <div key={item.id} className={`${workspaceInset} p-3`}>
              <p className="text-sm text-slate-100">{item.event_type.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
            </div>
          ))}
          {!overview?.activity.length ? <p className="text-sm text-slate-400">No project activity yet.</p> : null}
        </div>
      </div>
    </section>
  )

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_42%,#020617_100%)] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 px-4 backdrop-blur">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
          <div className="flex items-center gap-4">
            <Link href="/feed" className="text-sm font-semibold text-teal-200 transition hover:text-teal-100">
              ← Ideas
            </Link>
            <div>
              <p className="text-base font-semibold text-white">{overview?.project.name || 'Project Workspace'}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <select
                  value={currentStage}
                  disabled={workspaceBusy}
                  onChange={(event) => void updateStage(event.target.value)}
                  className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-semibold uppercase text-teal-200 outline-none"
                >
                  {stages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                <span>•</span>
                <span className={mutedPill}>{progress}% complete</span>
                <span>•</span>
                  <span>{teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className={connectionStatus === 'Offline' ? 'text-slate-500' : 'text-teal-300'}>{connectionStatus === 'Offline' ? 'Offline' : 'Connected'}</span>
            {totalUnread ? (
              <button type="button" onClick={() => setActiveWorkspaceTab('discuss')} className="font-semibold text-teal-300 hover:text-teal-200">
                {totalUnread} unread
              </button>
            ) : null}
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {workspaceTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveWorkspaceTab(tab)}
              className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize transition ${
                activeWorkspaceTab === tab
                  ? 'border-teal-400 text-teal-200'
                  : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {tab === 'discuss' ? 'Discuss' : tab}
            </button>
          ))}
        </nav>
      </header>

      {activeWorkspaceTab === 'overview' ? renderOverview() : null}
      {activeWorkspaceTab === 'work' ? renderWork() : null}
      {activeWorkspaceTab === 'discuss' ? renderRooms() : null}

      {activeWorkspaceTab === 'build' ? (
        <>
      <div className="px-4 pt-3 lg:hidden"><div className="grid grid-cols-3 rounded-xl border border-slate-800 bg-slate-950/70 p-1">{(['files', 'editor', 'ai'] as BuildPane[]).map((pane) => <button key={pane} type="button" onClick={() => setMobileBuildPane(pane)} className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${mobileBuildPane === pane ? 'bg-teal-400 text-slate-950' : 'text-slate-400'}`}>{pane}</button>)}</div></div>
      <div className={`grid min-h-[calc(100vh-129px)] grid-cols-1 gap-4 p-4 ${aiPanelOpen ? 'xl:grid-cols-[260px_minmax(0,1fr)_360px]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <aside className={`${workspaceSurface} min-h-[280px] p-3 ${mobileBuildPane === 'files' ? 'block' : 'hidden lg:block'}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">Files</p>
              <p className="mt-1 text-xs text-slate-500">{nodes.length} workspace item{nodes.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <div className="mb-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void createNode('file')} className={`${primaryAction} px-3 py-1.5`}>
              New File
            </button>
            <button type="button" disabled={busy} onClick={() => void createNode('folder')} className={`${secondaryAction} px-3 py-1.5`}>
              New Folder
            </button>
          </div>
          {error ? <p className="mb-3 rounded-xl border border-rose-900/80 bg-rose-950/50 p-2 text-xs text-rose-200">{error}</p> : null}
          <div className="space-y-1">{renderTree(null)}</div>
        </aside>

        <section className={`${workspaceSurface} ${mobileBuildPane === 'editor' ? 'flex' : 'hidden lg:flex'} min-h-[calc(100vh-177px)] min-w-0 flex-col overflow-hidden`}>
          <div className="flex min-h-12 items-center gap-2 border-b border-slate-800/80 bg-slate-950/50 px-3">
            {tabs.length ? (
              tabs.map((tabId) => {
                const tab = nodes.find((node) => node.id === tabId)
                if (!tab) return null
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openFile(tab)}
                    className={`flex max-w-[220px] items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                      openId === tab.id ? 'bg-teal-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{tab.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        closeTab(tab.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') closeTab(tab.id)
                      }}
                      className="rounded-full px-1 text-current opacity-70 hover:bg-slate-700/40 hover:opacity-100"
                    >
                      x
                    </span>
                  </button>
                )
              })
            ) : (
              <span className="px-2 text-sm text-slate-500">Open a file to start editing</span>
            )}
          </div>

          {open ? (
            <div className="min-h-0 flex-1">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-2 text-xs text-slate-500"><span className="truncate text-slate-300">{pathForNode(open)}</span><span className="shrink-0">{connectionStatus === 'Saving' ? 'Saving…' : connectionStatus === 'Offline' ? 'Offline' : `${connectionStatus} • autosaves`}</span></div>
            <MonacoEditor
              key={open.id}
              height="calc(100% - 37px)"
              defaultValue={open.content || ''}
              language={languageFor(open.name)}
              theme="vs-dark"
              onMount={(editor, monaco) => void bindEditor(editor, monaco)}
              options={{
                automaticLayout: true,
                bracketPairColorization: { enabled: true },
                folding: true,
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: 'on',
              }}
            />
            </div>
          ) : (
            <div className="grid min-h-[420px] flex-1 place-items-center text-center text-slate-500">
              <div>
                <p className="text-lg font-semibold text-slate-300">Create or open a file</p>
                <p className="mt-2 text-sm">Your collaborative editor will appear here.</p>
              </div>
            </div>
          )}
        </section>
        {aiPanelOpen ? (
          <div className={`${mobileBuildPane === 'ai' ? 'block' : 'hidden'} lg:block`}><BuildWithAiPanel
            open={aiPanelOpen}
            busy={aiBusy}
            error={aiError}
            runs={aiRuns}
            changeSets={aiChangeSets}
            fileChanges={aiFileChanges}
            activeFileName={open?.name}
            onToggle={() => setAiPanelOpen((current) => !current)}
            onSubmit={submitAiPrompt}
            onAccept={acceptAiChangeSet}
            onReject={rejectAiChangeSet}
          /></div>
        ) : null}
      </div>

      {!aiPanelOpen ? (
        <BuildWithAiPanel
          open={aiPanelOpen}
          busy={aiBusy}
          error={aiError}
          runs={aiRuns}
          changeSets={aiChangeSets}
          fileChanges={aiFileChanges}
          activeFileName={open?.name}
          onToggle={() => setAiPanelOpen((current) => !current)}
          onSubmit={submitAiPrompt}
          onAccept={acceptAiChangeSet}
          onReject={rejectAiChangeSet}
        />
      ) : null}
        </>
      ) : null}

      {newWorkItem ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur">
          <div className={`${workspaceSurface} w-full max-w-xl p-5`}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">New work</p><h2 className="mt-1 text-xl font-semibold text-white">Create {newWorkItem}</h2></div>
              <button type="button" onClick={() => setNewWorkItem(null)} className={secondaryAction}>Close</button>
            </div>
            <div className="mt-4 flex gap-2">
              {(['objective', 'task'] as NewWorkItem[]).map((item) => <button key={item} type="button" onClick={() => setNewWorkItem(item)} className={newWorkItem === item ? activePill : mutedPill}>{item}</button>)}
            </div>
            {workspaceError ? <div role="alert" className="mt-4 rounded-xl border border-rose-900/80 bg-rose-950/60 p-3 text-sm text-rose-200">{workspaceError}</div> : null}
            {newWorkItem === 'objective' ? (
              <form onSubmit={async (event) => { if (await createObjective(event)) setNewWorkItem(null) }} className="mt-4">
                <input value={objectiveForm.title} onChange={(event) => setObjectiveForm((current) => ({ ...current, title: event.target.value }))} className={workspaceField} placeholder="Objective title" autoFocus />
                <textarea value={objectiveForm.description} onChange={(event) => setObjectiveForm((current) => ({ ...current, description: event.target.value }))} className={`${workspaceField} mt-3 resize-none`} rows={4} placeholder="Why this matters and what success looks like" />
                <div className="mt-3 grid grid-cols-2 gap-2"><select value={objectiveForm.priority} onChange={(event) => setObjectiveForm((current) => ({ ...current, priority: event.target.value }))} className={workspaceSelect}>{['low', 'medium', 'high', 'critical'].map((priority) => <option key={priority}>{priority}</option>)}</select><select value={objectiveForm.stage} onChange={(event) => setObjectiveForm((current) => ({ ...current, stage: event.target.value }))} className={workspaceSelect}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></div>
                <button disabled={workspaceBusy} className={`${primaryAction} mt-4 w-full`}>Create Objective</button>
              </form>
            ) : (
              <form onSubmit={async (event) => { if (await createTask(event)) setNewWorkItem(null) }} className="mt-4">
                <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} className={workspaceField} placeholder="Task title" autoFocus />
                <textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} className={`${workspaceField} mt-3 resize-none`} rows={4} placeholder="Task details" />
                <select aria-label="Associated objective" value={taskForm.objective_id} onChange={(event) => setTaskForm((current) => ({ ...current, objective_id: event.target.value }))} className={`${workspaceSelect} mt-3`}><option value="">No objective</option>{(overview?.objectives || []).map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}</select>
                <select aria-label="Assignee" value={taskForm.assigned_to} onChange={(event) => setTaskForm((current) => ({ ...current, assigned_to: event.target.value }))} className={`${workspaceSelect} mt-3`}><option value="">Unassigned</option>{teamMembers.filter((member) => member.user_id).map((member) => <option key={member.id} value={member.user_id || ''}>{member.member_name || member.user?.email || member.member_email || 'Project member'}</option>)}</select>
                <div className="mt-3 grid grid-cols-2 gap-2"><select value={taskForm.suggested_role} onChange={(event) => setTaskForm((current) => ({ ...current, suggested_role: event.target.value }))} className={workspaceSelect}><option value="any">General</option><option value="researcher">Research</option><option value="designer">Design</option><option value="coder">Engineering</option><option value="builder">Testing</option><option value="thinker">Documentation</option><option value="entrepreneur">Outreach</option></select><select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))} className={workspaceSelect}>{['low', 'medium', 'high', 'critical'].map((priority) => <option key={priority}>{priority}</option>)}</select></div>
                <button disabled={workspaceBusy} className={`${primaryAction} mt-4 w-full`}>Create Task</button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {(teamPanelOpen || addMembersOpen) ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 backdrop-blur">
          <div className="mx-auto my-8 max-w-5xl rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Project Team</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{addMembersOpen ? 'Add Members' : 'Team Management'}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Manage role coverage, invitations, and workspace access for this project.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTeamPanelOpen(false)
                  setAddMembersOpen(false)
                }}
                className={secondaryAction}
              >
                Close
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[0.9fr_1.1fr]">
              <aside className="space-y-5">
                {teamError ? <div className="rounded-xl border border-rose-900/80 bg-rose-950/60 p-3 text-sm text-rose-200">{teamError}</div> : null}

                <section className={workspaceInset + ' p-4'}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Team Needs</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {roleNeedsSummary.length ? `${filledRequiredRoles} / ${roleNeedsSummary.length} required roles covered` : 'No required roles set yet'}
                      </p>
                    </div>
                    {canManageTeam ? (
                      <button type="button" onClick={() => void searchMembers(true)} className={secondaryAction} disabled={teamBusy}>
                        Find Matches
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-2">
                    {teamCoverage.map((item) => (
                      <div key={item.role} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{roleEmoji[item.role] || ''} {roleLabels[item.role] || item.role}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.required ? `${item.filled} filled${item.invited ? ` • ${item.invited} invited` : ''}` : 'Not required'}
                            </p>
                          </div>
                          <span className={item.required && !item.open ? activePill : mutedPill}>
                            {item.required ? `${item.filled} / ${item.required}` : '—'}
                          </span>
                        </div>
                        {canManageTeam ? (
                          <div className="mt-3 flex items-center gap-2">
                            <button type="button" disabled={teamBusy || item.required <= 0} onClick={() => void updateRoleNeed(item.role, Math.max(item.required - 1, 0))} className={secondaryAction}>
                              -
                            </button>
                            <button type="button" disabled={teamBusy} onClick={() => void updateRoleNeed(item.role, item.required + 1)} className={secondaryAction}>
                              +
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                <section className={workspaceInset + ' p-4'}>
                  <p className="text-sm font-semibold text-white">All Members</p>
                  <div className="mt-4 space-y-3">
                    {teamMembers.map((member) => (
                      <div key={member.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{member.member_name || member.user?.email || member.member_email}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {member.is_lead ? 'Project Lead' : member.permissions === 'viewer' ? 'Viewer' : 'Member'}
                            </p>
                            <p className="mt-1 text-xs text-teal-300">{roleSummary(member.member_role || member.user?.profile_type) || 'Contributor'}</p>
                          </div>
                          {member.is_lead ? <span className={activePill}>Lead</span> : null}
                        </div>
                        {canManageTeam && !member.is_lead ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <select
                              value={(member.member_role || '').split(',')[0]?.trim().toLowerCase() || ''}
                              onChange={(event) => void updateMemberRole(member, event.target.value)}
                              className={workspaceSelect}
                            >
                              <option value="">Contribution role</option>
                              {contributionRoles.filter((role) => role !== 'any').map((role) => (
                                <option key={role} value={role}>{roleLabels[role]}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => void removeMember(member)} className="rounded-xl border border-rose-900/80 bg-rose-950/40 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-950">
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!teamMembers.length ? <p className="text-sm text-slate-500">No accepted members yet.</p> : null}
                    {currentMember && !currentMember.is_lead ? (
                      <button type="button" onClick={() => void leaveProject()} className="rounded-xl border border-rose-900/80 bg-rose-950/40 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-950">
                        Leave Project
                      </button>
                    ) : null}
                  </div>
                </section>
              </aside>

              <div className="space-y-5">
                {canManageTeam ? (
                  <section className={workspaceInset + ' p-4'}>
                    <p className="text-sm font-semibold text-white">Add Members</p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        void searchMembers(false)
                      }}
                      className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
                    >
                      <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} className={workspaceField} placeholder="Search people by username, role, or interests" />
                      <select value={memberRoleFilter} onChange={(event) => setMemberRoleFilter(event.target.value)} className={workspaceSelect}>
                        <option value="">Any role</option>
                        {contributionRoles.filter((role) => role !== 'any').map((role) => (
                          <option key={role} value={role}>{roleLabels[role]}</option>
                        ))}
                      </select>
                      <button type="submit" disabled={teamBusy} className={primaryAction}>
                        Search
                      </button>
                    </form>
                    <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className={workspaceSelect}>
                        {contributionRoles.filter((role) => role !== 'any').map((role) => (
                          <option key={role} value={role}>{roleLabels[role]}</option>
                        ))}
                      </select>
                      <input value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} className={workspaceField} placeholder="Optional invitation message" />
                    </div>

                    <div className="mt-4 rounded-xl border border-teal-400/20 bg-teal-400/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-200">Invite by Google/email</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Use this when someone signs in with Google but does not appear in search yet. They’ll see the invitation after signing in with this email.
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(event) => setInviteEmail(event.target.value)}
                          className={workspaceField}
                          placeholder="person@gmail.com"
                        />
                        <button type="button" disabled={teamBusy || !inviteEmail.trim()} onClick={() => void inviteByEmail()} className={primaryAction}>
                          Send Invite
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {memberCandidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">{candidate.display_name}</p>
                              <p className="mt-1 text-xs text-slate-500">@{candidate.username}</p>
                              <p className="mt-2 text-sm text-teal-300">{candidate.roles.map((role) => `${roleEmoji[role] || ''} ${roleLabels[role] || role}`).join(' • ') || 'Contributor'}</p>
                              {candidate.domains.length ? <p className="mt-1 text-xs text-slate-500">Interests: {candidate.domains.join(' • ')}</p> : null}
                              <p className="mt-2 text-xs text-slate-400">
                                {candidate.availability_status === 'open' ? 'Open to projects' : candidate.availability_status}
                                {candidate.weekly_availability ? ` • ${candidate.weekly_availability} hrs/week` : ''}
                              </p>
                              {candidate.open_role_matches.length ? (
                                <p className="mt-2 text-xs text-emerald-300">
                                  Why this match: fills open {candidate.open_role_matches.map((role) => roleLabels[role] || role).join(', ')} slot
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={mutedPill}>{Math.min(candidate.score, 99)}%</span>
                              <button type="button" disabled={teamBusy} onClick={() => void inviteCandidate(candidate)} className={primaryAction}>
                                Invite
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!memberCandidates.length ? <p className="text-sm text-slate-500">Search people or use Find Matches to invite contributors for open role slots.</p> : null}
                    </div>
                  </section>
                ) : null}

                <section className={workspaceInset + ' p-4'}>
                  <p className="text-sm font-semibold text-white">Pending Invitations</p>
                  <div className="mt-4 space-y-3">
                    {pendingInvitations.map((member) => (
                      <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{member.member_name || member.member_email}</p>
                          <p className="mt-1 text-xs text-teal-300">{roleSummary(member.member_role) || 'Contributor'} • Pending</p>
                          {member.created_at ? <p className="mt-1 text-xs text-slate-600">Sent {new Date(member.created_at).toLocaleString()}</p> : null}
                        </div>
                        {canManageTeam ? (
                          <button type="button" disabled={teamBusy} onClick={() => void cancelInvitation(member.id)} className={secondaryAction}>
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {!pendingInvitations.length ? <p className="text-sm text-slate-500">No pending invitations.</p> : null}
                  </div>
                </section>

                {inactiveMemberships.length ? (
                  <section className={workspaceInset + ' p-4'}>
                    <p className="text-sm font-semibold text-white">Recent Membership Changes</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-500">
                      {inactiveMemberships.slice(0, 4).map((member) => (
                        <p key={member.id}>{member.member_name || member.member_email} • {member.invitation_status}</p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .yRemoteSelection {
          background-color: rgba(45, 212, 191, 0.22);
        }

        .yRemoteSelectionHead {
          border-left: 2px solid rgb(45, 212, 191);
          position: absolute;
        }
      `}</style>
    </main>
  )
}

function displayName(message: WorkspaceMessage) {
  return message.user?.email?.split('@')[0] || 'Project member'
}

function roleSummary(profileType?: string | null) {
  return (profileType || '')
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2)
    .map((role) => `${roleEmoji[role] || ''} ${roleLabels[role] || role}`.trim())
    .join(' · ')
}

function MessageCard({ message, replies, onReply }: { message: WorkspaceMessage; replies: WorkspaceMessage[]; onReply: () => void }) {
  const author = displayName(message)
  const roles = roleSummary(message.user?.profile_type)
  return (
    <article className={`${workspaceInset} p-4`}>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-400 text-sm font-bold text-slate-950">
          {author.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-100">{author}</p>
            {roles ? <span className="text-xs text-teal-300">{roles}</span> : null}
            <span className="text-xs text-slate-600">{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{message.content}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <button type="button" onClick={onReply} className="font-semibold text-teal-300 hover:text-teal-200">
              Reply
            </button>
            <span className="text-slate-600">Turn Into… soon</span>
          </div>

          {replies.length ? (
            <div className="mt-4 space-y-3 border-l border-slate-800 pl-4">
              {replies.map((reply) => (
                <div key={reply.id} className="rounded-xl bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-slate-200">{displayName(reply)}</p>
                    <span className="text-xs text-slate-600">{new Date(reply.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-400">{reply.content}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function WorkPlaceholder({ label, description }: { label: string; description: string }) {
  return (
    <div className={`${workspaceSurface} p-5`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${workspaceInset} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function ObjectiveCard({ objective, taskCount, compact = false }: { objective: Objective; taskCount: number; compact?: boolean }) {
  return (
    <div className={`${workspaceInset} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-100">{objective.title}</p>
        <span className={mutedPill}>{objective.status}</span>
      </div>
      {!compact ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">{objective.description || 'No description yet.'}</p> : null}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span>{objective.priority}</span>
        <span>·</span>
        <span>{taskCount} task{taskCount === 1 ? '' : 's'}</span>
        {objective.stage ? (
          <>
            <span>·</span>
            <span>{objective.stage}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: ProjectTask }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-100">{task.title}</p>
        <span className={mutedPill}>{task.status}</span>
      </div>
      <p className="mt-1 text-xs text-teal-300">{roleLabels[(task.suggested_role || 'any').toLowerCase()] || task.suggested_role || 'Any contributor'}</p>
    </div>
  )
}
