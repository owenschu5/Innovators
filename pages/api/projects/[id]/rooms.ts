import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticatedSupabase } from '../../../../lib/supabaseServer'

const roomTypes = ['general', 'announcement', 'role', 'objective', 'custom']

type RoomSummary = {
  id: string
  slug: string
  created_at: string
  workspace_id: string
  name: string
  description: string | null
  type: string
  role_type: string | null
  objective_id: string | null
}

type ReadSummary = {
  room_id: string
  last_read_at: string
}

type MessageSummary = {
  id: string
  room_id: string
  created_at: string
}

const defaultRooms = [
  { slug: 'general', name: '# general', type: 'general', description: 'Open discussion for the whole project team.' },
  { slug: 'announcements', name: '# announcements', type: 'announcement', description: 'Important project updates from project leads.' },
  {
    slug: 'thinkers',
    name: '🧠 thinkers',
    type: 'role',
    role_type: 'thinker',
    description: 'Discuss project direction, systems, requirements, tradeoffs, decisions, and unanswered questions.',
  },
  {
    slug: 'researchers',
    name: '🔬 researchers',
    type: 'role',
    role_type: 'researcher',
    description: 'Share evidence, findings, experiments, interviews, sources, and unanswered research questions.',
  },
  {
    slug: 'designers',
    name: '🎨 designers',
    type: 'role',
    role_type: 'designer',
    description: 'Discuss user experience, flows, mockups, interfaces, and design decisions.',
  },
  {
    slug: 'coders',
    name: '⌨️ coders',
    type: 'role',
    role_type: 'coder',
    description: 'Discuss implementation, architecture, bugs, APIs, and software development.',
  },
  {
    slug: 'builders',
    name: '🏗️ builders',
    type: 'role',
    role_type: 'builder',
    description: 'Discuss prototypes, integrations, implementation, hardware, testing, and making the solution work.',
  },
  {
    slug: 'entrepreneurs',
    name: '🚀 entrepreneurs',
    type: 'role',
    role_type: 'entrepreneur',
    description: 'Discuss users, market validation, business model, partners, pilots, funding, and launch strategy.',
  },
]

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : 'Rooms operation failed'
  if (message === 'Authentication required') return 401
  if (message.includes('denied') || message.includes('Read-only')) return 403
  if (message.includes('Rooms database tables are missing')) return 503
  if (message.includes('not found') || message.includes('unavailable')) return 404
  if (message.includes('Invalid') || message.includes('Missing')) return 400
  return 500
}

function missingRoomsSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return (
    record.code === 'PGRST205' ||
    record.message?.includes("Could not find the table 'public.workspace_rooms'") ||
    record.message?.includes("Could not find the table 'public.workspace_messages'") ||
    record.message?.includes("Could not find the table 'public.workspace_room_reads'")
  )
}

function clean(value: unknown) {
  return String(value || '').trim()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[#@]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function canEdit(permissions?: string | null) {
  return permissions !== 'viewer'
}

function canPostAnnouncement(member: { permissions?: string | null; is_lead?: boolean | null }) {
  return Boolean(member.is_lead || ['admin', 'owner', 'lead'].includes(member.permissions || ''))
}

async function access(req: NextApiRequest, groupId: string) {
  const { db, user } = await authenticatedSupabase(req)

  const { data: group, error: groupError } = await db
    .from('idea_groups')
    .select('id, idea_id, name, summary, status, workspace_active')
    .eq('id', groupId)
    .single()
  if (groupError || !group?.workspace_active || group.status !== 'approved') throw new Error('Workspace unavailable')

  const { data: member, error: memberError } = await db
    .from('idea_group_members')
    .select('id, permissions, member_role, is_lead')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .eq('invitation_status', 'accepted')
    .maybeSingle()
  if (memberError || !member) throw new Error('Workspace access denied')

  const { data: workspace, error: workspaceError } = await db
    .from('project_workspaces')
    .select('*')
    .eq('project_group_id', groupId)
    .single()
  if (workspaceError || !workspace) throw new Error('Workspace not found')

  return { db, user, group, workspace, member }
}

type RequestDb = Awaited<ReturnType<typeof authenticatedSupabase>>['db']

async function seedDefaultRooms(db: RequestDb, workspaceId: string, userId: string) {
  const rows = defaultRooms.map((room) => ({
    workspace_id: workspaceId,
    name: room.name,
    slug: room.slug,
    description: room.description,
    type: room.type,
    role_type: 'role_type' in room ? room.role_type : null,
    created_by: userId,
  }))
  const { error } = await db.from('workspace_rooms').upsert(rows, { onConflict: 'workspace_id,slug', ignoreDuplicates: true })
  if (missingRoomsSchema(error)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
  if (error) throw error
}

async function loadRooms(db: RequestDb, workspaceId: string, userId: string) {
  const [roomsResult, readsResult, messagesResult] = await Promise.all([
    db.from('workspace_rooms').select('*').eq('workspace_id', workspaceId).is('archived_at', null).order('created_at', { ascending: true }),
    db.from('workspace_room_reads').select('room_id,last_read_at').eq('workspace_id', workspaceId).eq('user_id', userId),
    db.from('workspace_messages').select('id,room_id,created_at').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
  ])

  if (missingRoomsSchema(roomsResult.error) || missingRoomsSchema(readsResult.error) || missingRoomsSchema(messagesResult.error)) {
    throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
  }
  if (roomsResult.error) throw roomsResult.error
  if (readsResult.error) throw readsResult.error
  if (messagesResult.error) throw messagesResult.error

  const readsData = (readsResult.data || []) as ReadSummary[]
  const roomsData = (roomsResult.data || []) as RoomSummary[]
  const messages = (messagesResult.data || []) as MessageSummary[]
  const reads = new Map(readsData.map((read) => [read.room_id, read.last_read_at]))
  return roomsData.map((room) => {
    const lastReadAt = reads.get(room.id)
    const roomMessages = messages.filter((message) => message.room_id === room.id)
    const unread_count = lastReadAt ? roomMessages.filter((message) => new Date(message.created_at) > new Date(lastReadAt)).length : roomMessages.length
    return {
      ...room,
      last_read_at: lastReadAt || null,
      unread_count,
      last_message_at: roomMessages[0]?.created_at || null,
    }
  })
}

async function loadMessages(db: RequestDb, workspaceId: string, roomId: string) {
  const { data, error } = await db
    .from('workspace_messages')
    .select('*, user:users(id,email,profile_type)')
    .eq('workspace_id', workspaceId)
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100)

  if (missingRoomsSchema(error)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
  if (error) throw error
  return data || []
}

async function logActivity(db: RequestDb, groupId: string, actorId: string, eventType: string, metadata: Record<string, unknown>) {
  await db.from('project_activities').insert({ group_id: groupId, actor_id: actorId, event_type: eventType, metadata })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing project id' })

    const accessData = await access(req, id)

    if (req.method === 'GET') {
      await seedDefaultRooms(accessData.db, accessData.workspace.id, accessData.user.id)
      const rooms = await loadRooms(accessData.db, accessData.workspace.id, accessData.user.id)
      const requestedRoomId = clean(req.query.room_id)
      const activeRoom = rooms.find((room: RoomSummary) => room.id === requestedRoomId) || rooms.find((room: RoomSummary) => room.slug === 'general') || rooms[0]
      const messages = activeRoom ? await loadMessages(accessData.db, accessData.workspace.id, activeRoom.id) : []
      return res.status(200).json({ workspace: accessData.workspace, member: accessData.member, rooms, active_room_id: activeRoom?.id || null, messages })
    }

    if (req.method === 'POST') {
      if (!canEdit(accessData.member.permissions)) return res.status(403).json({ error: 'Read-only access' })
      const type = clean(req.body.type)

      if (type === 'room') {
        if (!accessData.member.is_lead && !['admin', 'owner', 'lead'].includes(accessData.member.permissions || '')) {
          return res.status(403).json({ error: 'Only project leads can create custom rooms' })
        }
        const name = clean(req.body.name)
        if (!name) return res.status(400).json({ error: 'Missing room name' })
        const slug = slugify(clean(req.body.slug) || name)
        if (!slug) return res.status(400).json({ error: 'Invalid room name' })
        const roomType = roomTypes.includes(clean(req.body.room_type)) ? clean(req.body.room_type) : 'custom'
        const { data, error } = await accessData.db
          .from('workspace_rooms')
          .insert({
            workspace_id: accessData.workspace.id,
            name: name.startsWith('#') ? name : `# ${name}`,
            slug,
            description: clean(req.body.description) || null,
            type: roomType,
            role_type: clean(req.body.role_type) || null,
            objective_id: clean(req.body.objective_id) || null,
            created_by: accessData.user.id,
          })
          .select('*')
          .single()
        if (missingRoomsSchema(error)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
        if (error || !data) throw new Error(error?.message || 'Unable to create room')
        await logActivity(accessData.db, accessData.group.id, accessData.user.id, 'workspace_room_created', { room_id: data.id, room: data.slug })
        return res.status(201).json({ room: data })
      }

      if (type === 'message') {
        const roomId = clean(req.body.room_id)
        const content = clean(req.body.content)
        if (!roomId) return res.status(400).json({ error: 'Missing room id' })
        if (!content) return res.status(400).json({ error: 'Missing message content' })

        const { data: room, error: roomError } = await accessData.db
          .from('workspace_rooms')
          .select('*')
          .eq('id', roomId)
          .eq('workspace_id', accessData.workspace.id)
          .is('archived_at', null)
          .single()
        if (missingRoomsSchema(roomError)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
        if (roomError || !room) return res.status(404).json({ error: 'Room not found' })
        if (room.type === 'announcement' && !canPostAnnouncement(accessData.member)) return res.status(403).json({ error: 'Only project leads can post announcements' })

        const parentMessageId = clean(req.body.parent_message_id) || null
        if (parentMessageId) {
          const { data: parent } = await accessData.db
            .from('workspace_messages')
            .select('id')
            .eq('id', parentMessageId)
            .eq('room_id', room.id)
            .eq('workspace_id', accessData.workspace.id)
            .maybeSingle()
          if (!parent) return res.status(400).json({ error: 'Invalid parent message' })
        }

        const { data, error } = await accessData.db
          .from('workspace_messages')
          .insert({
            workspace_id: accessData.workspace.id,
            room_id: room.id,
            user_id: accessData.user.id,
            parent_message_id: parentMessageId,
            content,
          })
          .select('*, user:users(id,email,profile_type)')
          .single()
        if (missingRoomsSchema(error)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
        if (error || !data) throw new Error(error?.message || 'Unable to send message')
        await logActivity(accessData.db, accessData.group.id, accessData.user.id, 'workspace_message_created', { room_id: room.id, room: room.slug })
        return res.status(201).json({ message: data })
      }

      return res.status(400).json({ error: 'Invalid creation type' })
    }

    if (req.method === 'PATCH') {
      const action = clean(req.body.action)
      if (action !== 'read') return res.status(400).json({ error: 'Invalid action' })
      const roomId = clean(req.body.room_id)
      if (!roomId) return res.status(400).json({ error: 'Missing room id' })

      const { data: room, error: roomError } = await accessData.db
        .from('workspace_rooms')
        .select('id')
        .eq('id', roomId)
        .eq('workspace_id', accessData.workspace.id)
        .maybeSingle()
      if (missingRoomsSchema(roomError)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
      if (roomError || !room) return res.status(404).json({ error: 'Room not found' })

      const readAt = new Date().toISOString()
      const { data, error } = await accessData.db
        .from('workspace_room_reads')
        .upsert({ workspace_id: accessData.workspace.id, room_id: room.id, user_id: accessData.user.id, last_read_at: readAt }, { onConflict: 'room_id,user_id' })
        .select('*')
        .single()
      if (missingRoomsSchema(error)) throw new Error('Rooms database tables are missing. Run sql/migrations/20260811_workspace_rooms_phase1.sql in Supabase, then reload the app.')
      if (error || !data) throw new Error(error?.message || 'Unable to mark room read')
      return res.status(200).json({ read: data })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rooms operation failed'
    return res.status(statusFor(error)).json({ error: message })
  }
}
