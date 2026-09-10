import fs from 'node:fs'
import path from 'node:path'
import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'

function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    const fullPath = path.join(process.cwd(), file)
    if (!fs.existsSync(fullPath)) continue

    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadLocalEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const port = Number(process.env.COLLAB_PORT || 1234)

function requireConfig() {
  if (!supabaseUrl || !supabaseKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for collaboration persistence')
}

function parseDocumentName(name) {
  const parts = String(name || '').split(':')
  if (parts.length !== 4 || parts[0] !== 'workspace' || parts[2] !== 'file' || !parts[1] || !parts[3]) {
    throw new Error('Invalid workspace document name')
  }
  return { projectGroupId: parts[1], fileId: parts[3] }
}

async function supabase(path, options = {}) {
  requireConfig()
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = payload?.message || payload?.error || 'Supabase request failed'
    throw new Error(message)
  }
  return payload
}

function isMissingWorkspaceSchema(error) {
  return (
    error?.message?.includes("Could not find the table 'public.project_workspaces'") ||
    error?.message?.includes("Could not find the table 'public.workspace_nodes'") ||
    error?.message?.includes("Could not find the table 'public.workspace_file_versions'")
  )
}

async function getUser(token) {
  requireConfig()
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('Invalid session')
  return response.json()
}

async function loadWorkspaceFile(projectGroupId, fileId) {
  const groups = await supabase(
    `idea_groups?id=eq.${encodeURIComponent(projectGroupId)}&workspace_active=eq.true&status=eq.approved&select=id`
  )
  if (!groups?.length) throw new Error('Workspace unavailable')

  let workspaces
  try {
    workspaces = await supabase(
      `project_workspaces?project_group_id=eq.${encodeURIComponent(projectGroupId)}&select=id`
    )
  } catch (error) {
    if (isMissingWorkspaceSchema(error)) {
      throw new Error('Workspace database tables are missing. Run sql/migrations/20260810_workspace_files.sql in Supabase, then reload the app.')
    }
    throw error
  }
  if (!workspaces?.length) throw new Error('Workspace has not been initialized')

  let files
  try {
    files = await supabase(
      `workspace_nodes?id=eq.${encodeURIComponent(fileId)}&workspace_id=eq.${encodeURIComponent(workspaces[0].id)}&node_type=eq.file&select=id,workspace_id,name,content,version`
    )
  } catch (error) {
    if (isMissingWorkspaceSchema(error)) {
      throw new Error('Workspace database tables are missing. Run sql/migrations/20260810_workspace_files.sql in Supabase, then reload the app.')
    }
    throw error
  }
  if (!files?.length) throw new Error('File not found')
  return files[0]
}

async function loadMembership(projectGroupId, userId) {
  const memberships = await supabase(
    `idea_group_members?group_id=eq.${encodeURIComponent(projectGroupId)}&user_id=eq.${encodeURIComponent(userId)}&invitation_status=eq.accepted&select=id,permissions`
  )
  if (!memberships?.length) throw new Error('Not a workspace member')
  return memberships[0]
}

function canEdit(permissions) {
  return permissions !== 'viewer'
}

function getText(document) {
  return document.getText('monaco')
}

const pendingStores = new Map()

async function storeFile({ document, documentName, lastContext }) {
  if (!lastContext?.file?.id || !canEdit(lastContext.member?.permissions)) return

  const content = getText(document).toString()
  const current = await supabase(
    `workspace_nodes?id=eq.${encodeURIComponent(lastContext.file.id)}&select=id,version`
  )
  const nextVersion = Number(current?.[0]?.version || lastContext.file.version || 0) + 1
  const now = new Date().toISOString()
  const userId = lastContext.user?.id || null

  const updated = await supabase(`workspace_nodes?id=eq.${encodeURIComponent(lastContext.file.id)}`, {
    method: 'PATCH',
    body: {
      content,
      version: nextVersion,
      updated_by: userId,
      updated_at: now,
    },
  })

  await supabase('workspace_file_versions', {
    method: 'POST',
    body: {
      node_id: lastContext.file.id,
      version: nextVersion,
      content,
      changed_by: userId,
      source: 'collaboration',
      created_at: now,
    },
  })

  lastContext.file = updated?.[0] || { ...lastContext.file, content, version: nextVersion }
  console.log(`[collab] stored ${documentName} v${nextVersion}`)
}

async function queueStore(payload) {
  const key = payload.lastContext?.file?.id || payload.documentName
  const previous = pendingStores.get(key) || Promise.resolve()
  const next = previous.catch(() => undefined).then(() => storeFile(payload))
  pendingStores.set(key, next)

  try {
    await next
  } finally {
    if (pendingStores.get(key) === next) pendingStores.delete(key)
  }
}

const server = new Server({
  port,
  name: 'innovators-workspace-collaboration',
  debounce: Number(process.env.COLLAB_STORE_DEBOUNCE_MS || 1500),
  maxDebounce: Number(process.env.COLLAB_STORE_MAX_DEBOUNCE_MS || 8000),
  async onAuthenticate({ token, documentName, context, connectionConfig }) {
    if (!token) throw new Error('Authentication required')
    const user = await getUser(token)
    const { projectGroupId, fileId } = parseDocumentName(documentName)
    const [member, file] = await Promise.all([
      loadMembership(projectGroupId, user.id),
      loadWorkspaceFile(projectGroupId, fileId),
    ])

    context.user = { id: user.id, email: user.email }
    context.member = member
    context.file = file
    context.projectGroupId = projectGroupId

    if (!canEdit(member.permissions)) connectionConfig.readOnly = true
    return { user: { id: user.id, name: user.email || user.id } }
  },
  async onLoadDocument({ document, context, documentName }) {
    const file = context.file || (await loadWorkspaceFile(parseDocumentName(documentName).projectGroupId, parseDocumentName(documentName).fileId))
    const text = getText(document)
    const metadata = document.getMap('innovators-workspace')
    document.transact(() => {
      if (metadata.get('databaseSnapshotApplied')) return
      if (!text.length && file.content) text.insert(0, file.content)
      metadata.set('databaseSnapshotApplied', true)
    }, 'database-snapshot')
  },
  async onStoreDocument(payload) {
    await queueStore(payload)
  },
})

try {
  await server.listen()
  console.log(`[collab] Hocuspocus listening on ws://localhost:${port}`)
} catch (error) {
  console.error(`[collab] failed to listen on ws://localhost:${port}`)
  console.error(error)
  process.exit(1)
}
