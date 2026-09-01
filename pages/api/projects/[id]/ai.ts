import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticatedSupabase } from '../../../../lib/supabaseServer'

type AiMode = 'ask' | 'plan' | 'edit' | 'build' | 'debug'
type WorkspaceNode = {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  node_type: 'file' | 'folder'
  content: string | null
  version: number
}
type FileInfo = WorkspaceNode & { path: string }
type AiChange = {
  operation: 'create' | 'modify' | 'delete' | 'rename'
  file_id?: string | null
  path?: string | null
  original_path?: string | null
  proposed_path?: string | null
  proposed_content?: string | null
}

const aiModes: AiMode[] = ['ask', 'plan', 'edit', 'build', 'debug']
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : 'AI workspace operation failed'
  if (message === 'Authentication required') return 401
  if (message.includes('denied') || message.includes('Read-only')) return 403
  if (message.includes('not found')) return 404
  if (message.includes('changed while AI was working')) return 409
  if (message.includes('database tables are missing')) return 503
  if (message.includes('OPENAI_API_KEY')) return 503
  return 500
}

function isMissingAiSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; message?: string }
  return (
    record.code === 'PGRST205' ||
    record.message?.includes("Could not find the table 'public.workspace_ai_runs'") ||
    record.message?.includes("Could not find the table 'public.workspace_ai_change_sets'") ||
    record.message?.includes("Could not find the table 'public.workspace_ai_file_changes'")
  )
}

function canUseMode(permissions: string | null | undefined, mode: AiMode) {
  if (permissions === 'viewer') return mode === 'ask'
  if (permissions === 'contributor') return mode === 'ask' || mode === 'plan'
  return true
}

function canEdit(permissions: string | null | undefined) {
  return permissions !== 'viewer' && permissions !== 'contributor'
}

async function access(req: NextApiRequest, groupId: string) {
  const { db, user } = await authenticatedSupabase(req)

  const { data: group, error: groupError } = await db
    .from('idea_groups')
    .select('id, idea_id, name, status, workspace_active, summary')
    .eq('id', groupId)
    .single()
  if (groupError || !group?.workspace_active || group.status !== 'approved') throw new Error('Workspace unavailable')

  const { data: member, error: memberError } = await db
    .from('idea_group_members')
    .select('permissions, member_role, is_lead')
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

  const { data: idea } = await db.from('ideas').select('id, title, description').eq('id', group.idea_id).maybeSingle()
  return { db, user, group, idea, workspace, member }
}

type RequestDb = Awaited<ReturnType<typeof authenticatedSupabase>>['db']

async function listFiles(db: RequestDb, workspaceId: string) {
  const { data, error } = await db.from('workspace_nodes').select('*').eq('workspace_id', workspaceId).order('node_type').order('name')
  if (error) throw error
  return addPaths((data || []) as WorkspaceNode[])
}

function addPaths(nodes: WorkspaceNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pathFor = (node: WorkspaceNode): string => {
    const parts = [node.name]
    let parent = node.parent_id ? byId.get(node.parent_id) : null
    while (parent) {
      parts.unshift(parent.name)
      parent = parent.parent_id ? byId.get(parent.parent_id) : null
    }
    return parts.join('/')
  }
  return nodes.map((node) => ({ ...node, path: pathFor(node) }))
}

function relevantFiles(prompt: string, files: FileInfo[], activeFileId?: string | null) {
  const terms = prompt.toLowerCase().split(/[^a-z0-9_.-]+/).filter((term) => term.length > 2)
  const filesOnly = files.filter((file) => file.node_type === 'file')
  const scored = filesOnly.map((file) => {
    const haystack = `${file.path}\n${file.content || ''}`.toLowerCase()
    let score = activeFileId && file.id === activeFileId ? 20 : 0
    if (/readme|package|app|index|auth|login|dashboard|button|component|style|css/.test(file.path.toLowerCase())) score += 4
    for (const term of terms) if (haystack.includes(term)) score += 3
    return { file, score }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, 8).map(({ file }) => file)
}

function compactContent(content: string | null) {
  const value = content || ''
  return value.length > 12000 ? `${value.slice(0, 12000)}\n\n/* truncated */` : value
}

async function callOpenAi(payload: {
  mode: AiMode
  prompt: string
  projectInfo: string
  tree: string
  files: FileInfo[]
  selectedCode?: string
}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server')

  const wantsChanges = ['edit', 'build', 'debug'].includes(payload.mode)
  const system = `You are Build With AI, a project-aware coding agent inside a collaborative Monaco/Yjs workspace.
You can only operate on the virtual workspace files provided in context.
Do not claim to run commands or tests.
Return only valid JSON. The JSON schema is:
{
  "answer": "short user-facing response",
  "summary": "one-sentence summary",
  "changes": [
    {
      "operation": "create" | "modify" | "delete" | "rename",
      "file_id": "existing file id for modify/delete/rename, omit for create",
      "path": "existing path if relevant",
      "proposed_path": "target path for create/rename/modify",
      "proposed_content": "full proposed file content for create/modify"
    }
  ]
}
For ask and plan mode, do not include file changes unless the user explicitly asks to prepare implementation changes.
For modify operations, return the full proposed file content, not a patch.
If you are unsure which file to edit, answer with a plan and no changes.`

  const user = {
    mode: payload.mode,
    prompt: payload.prompt,
    projectInfo: payload.projectInfo,
    fileTree: payload.tree,
    selectedCode: payload.selectedCode || null,
    relevantFiles: payload.files.map((file) => ({
      id: file.id,
      path: file.path,
      version: file.version,
      content: compactContent(file.content),
    })),
    instruction: wantsChanges
      ? 'Generate a reviewable multi-file change set. Preserve existing architecture and imports where possible.'
      : 'Answer from the provided project context without modifying files.',
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
    }),
  })

  const body = await response.json()
  if (!response.ok) throw new Error(body?.error?.message || 'OpenAI request failed')
  const content = body?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty response')
  return JSON.parse(content) as { answer?: string; summary?: string; changes?: AiChange[] }
}

async function createActivity(db: RequestDb, groupId: string, actorId: string, eventType: string, metadata: Record<string, unknown>, aiRunId?: string, changeSetId?: string) {
  await db.from('project_activities').insert({
    group_id: groupId,
    actor_id: actorId,
    event_type: eventType,
    metadata,
    ai_run_id: aiRunId || null,
    ai_change_set_id: changeSetId || null,
  })
}

async function createRun(data: {
  db: RequestDb
  workspaceId: string
  userId: string
  mode: AiMode
  prompt: string
}) {
  const { data: run, error } = await data.db
    .from('workspace_ai_runs')
    .insert({
      workspace_id: data.workspaceId,
      requested_by: data.userId,
      mode: data.mode,
      prompt: data.prompt,
      status: 'planning',
      model,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (isMissingAiSchema(error)) throw new Error('Workspace AI database tables are missing. Run sql/migrations/20260811_workspace_ai_agent.sql in Supabase, then reload the app.')
  if (error || !run) throw new Error(error?.message || 'Unable to create AI run')
  return run
}

async function saveAiResult(run: any, accessData: Awaited<ReturnType<typeof access>>, files: FileInfo[], aiResult: { answer?: string; summary?: string; changes?: AiChange[] }) {
  const fileById = new Map(files.map((file) => [file.id, file]))
  const fileByPath = new Map(files.map((file) => [file.path, file]))
  const changes = (aiResult.changes || []).filter((change) => change.operation)
  const now = new Date().toISOString()

  if (!changes.length) {
    const { data, error } = await accessData.db
      .from('workspace_ai_runs')
      .update({ status: 'applied', answer: aiResult.answer || aiResult.summary || 'Done.', completed_at: now })
      .eq('id', run.id)
      .select('*')
      .single()
    if (error) throw error
    await createActivity(accessData.db, accessData.group.id, accessData.user.id, 'ai_answered', { mode: run.mode, prompt: run.prompt }, run.id)
    return { run: data, changeSet: null, fileChanges: [] }
  }

  if (!canEdit(accessData.member.permissions)) throw new Error('Read-only access')

  const { data: changeSet, error: changeSetError } = await accessData.db
    .from('workspace_ai_change_sets')
    .insert({
      workspace_id: accessData.workspace.id,
      ai_run_id: run.id,
      requested_by: accessData.user.id,
      status: 'review_required',
      summary: aiResult.summary || aiResult.answer || 'AI proposed workspace changes.',
    })
    .select('*')
    .single()
  if (changeSetError || !changeSet) throw new Error(changeSetError?.message || 'Unable to create AI change set')

  const rows = changes.map((change) => {
    let existing: FileInfo | undefined
    if (change.file_id) existing = fileById.get(change.file_id)
    else if (change.path) existing = fileByPath.get(change.path) || fileByPath.get(change.original_path || '')
    const operation = change.operation
    if (operation !== 'create' && !existing) throw new Error(`AI proposed a ${operation} for an unknown file`)
    return {
      change_set_id: changeSet.id,
      file_id: existing?.id || null,
      operation,
      original_path: existing?.path || change.original_path || change.path || null,
      proposed_path: change.proposed_path || change.path || existing?.path || null,
      base_version: existing?.version || null,
      previous_content: existing?.content || null,
      proposed_content: operation === 'delete' ? null : change.proposed_content ?? null,
    }
  })

  const { data: fileChanges, error: fileChangeError } = await accessData.db.from('workspace_ai_file_changes').insert(rows).select('*')
  if (fileChangeError) throw fileChangeError

  const { data: updatedRun, error: runError } = await accessData.db
    .from('workspace_ai_runs')
    .update({ status: 'review_required', answer: aiResult.answer || aiResult.summary || 'AI changes are ready for review.', completed_at: now })
    .eq('id', run.id)
    .select('*')
    .single()
  if (runError) throw runError

  await createActivity(
    accessData.db,
    accessData.group.id,
    accessData.user.id,
    'ai_changes_proposed',
    { mode: run.mode, prompt: run.prompt, files_changed: rows.length },
    run.id,
    changeSet.id
  )
  return { run: updatedRun, changeSet, fileChanges: fileChanges || [] }
}

async function ensureFolder(db: RequestDb, workspaceId: string, segments: string[], userId: string) {
  let parentId: string | null = null
  for (const segment of segments) {
    let query = db
      .from('workspace_nodes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('node_type', 'folder')
      .eq('name', segment)
    query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null)
    const { data: existingFolder } = await query.maybeSingle()
    if (existingFolder) {
      parentId = existingFolder.id
      continue
    }

    const { data: created, error } = await db
      .from('workspace_nodes')
      .insert({ workspace_id: workspaceId, parent_id: parentId, name: segment, node_type: 'folder', created_by: userId, updated_by: userId })
      .select('*')
      .single()
    if (error || !created) throw new Error(error?.message || 'Unable to create folder')
    parentId = created.id
  }
  return parentId
}

function splitPath(path: string | null | undefined) {
  const parts = String(path || '').split('/').map((part) => part.trim()).filter(Boolean)
  if (!parts.length || parts.some((part) => part.includes('\\') || part.includes('..'))) throw new Error('Invalid proposed path')
  return { folders: parts.slice(0, -1), name: parts[parts.length - 1] }
}

async function applyChangeSet(changeSetId: string, accessData: Awaited<ReturnType<typeof access>>) {
  if (!canEdit(accessData.member.permissions)) throw new Error('Read-only access')

  const { data: changeSet, error: changeSetError } = await accessData.db
    .from('workspace_ai_change_sets')
    .select('*')
    .eq('id', changeSetId)
    .eq('workspace_id', accessData.workspace.id)
    .single()
  if (changeSetError || !changeSet) throw new Error('Change set not found')
  if (changeSet.status !== 'review_required') throw new Error('Change set is not awaiting review')

  const { data: changes, error: changesError } = await accessData.db.from('workspace_ai_file_changes').select('*').eq('change_set_id', changeSet.id).order('created_at')
  if (changesError) throw changesError

  const applied: any[] = []
  for (const change of changes || []) {
    if (change.operation === 'create') {
      const { folders, name } = splitPath(change.proposed_path)
      const parentId = await ensureFolder(accessData.db, accessData.workspace.id, folders, accessData.user.id)
      const { data: node, error } = await accessData.db
        .from('workspace_nodes')
        .insert({
          workspace_id: accessData.workspace.id,
          parent_id: parentId,
          name,
          node_type: 'file',
          content: change.proposed_content || '',
          created_by: accessData.user.id,
          updated_by: accessData.user.id,
        })
        .select('*')
        .single()
      if (error || !node) throw new Error(error?.message || 'Unable to create AI file')
      await accessData.db.from('workspace_file_versions').insert({ node_id: node.id, version: node.version, content: node.content || '', changed_by: accessData.user.id, source: 'ai' })
      applied.push({ ...change, file_id: node.id, applied_node: node })
      continue
    }

    const { data: current, error: currentError } = await accessData.db
      .from('workspace_nodes')
      .select('*')
      .eq('id', change.file_id)
      .eq('workspace_id', accessData.workspace.id)
      .single()
    if (currentError || !current) throw new Error('AI target file not found')
    if (current.version !== change.base_version && (current.content || '') !== (change.previous_content || '')) {
      throw new Error(`${change.original_path || current.name} changed while AI was working`)
    }

    if (change.operation === 'modify') {
      const nextVersion = Number(current.version || 0) + 1
      const { data: node, error } = await accessData.db
        .from('workspace_nodes')
        .update({ content: change.proposed_content || '', version: nextVersion, updated_by: accessData.user.id, updated_at: new Date().toISOString() })
        .eq('id', current.id)
        .select('*')
        .single()
      if (error || !node) throw new Error(error?.message || 'Unable to apply AI change')
      await accessData.db.from('workspace_file_versions').insert({ node_id: node.id, version: nextVersion, content: node.content || '', changed_by: accessData.user.id, source: 'ai' })
      applied.push({ ...change, applied_node: node })
    } else if (change.operation === 'delete') {
      const { error } = await accessData.db.from('workspace_nodes').delete().eq('id', current.id)
      if (error) throw error
      applied.push(change)
    }
  }

  const now = new Date().toISOString()
  await accessData.db
    .from('workspace_ai_change_sets')
    .update({ status: 'applied', accepted_by: accessData.user.id, accepted_at: now })
    .eq('id', changeSet.id)
  await accessData.db.from('workspace_ai_runs').update({ status: 'applied', completed_at: now }).eq('id', changeSet.ai_run_id)
  await createActivity(accessData.db, accessData.group.id, accessData.user.id, 'ai_changes_applied', { files_changed: applied.length }, changeSet.ai_run_id, changeSet.id)

  return { changeSet: { ...changeSet, status: 'applied', accepted_by: accessData.user.id, accepted_at: now }, appliedChanges: applied }
}

async function rejectChangeSet(changeSetId: string, accessData: Awaited<ReturnType<typeof access>>) {
  const { data: changeSet, error } = await accessData.db
    .from('workspace_ai_change_sets')
    .update({ status: 'rejected', rejected_by: accessData.user.id, rejected_at: new Date().toISOString() })
    .eq('id', changeSetId)
    .eq('workspace_id', accessData.workspace.id)
    .select('*')
    .single()
  if (error || !changeSet) throw new Error(error?.message || 'Change set not found')
  await accessData.db.from('workspace_ai_runs').update({ status: 'rejected' }).eq('id', changeSet.ai_run_id)
  await createActivity(accessData.db, accessData.group.id, accessData.user.id, 'ai_changes_rejected', {}, changeSet.ai_run_id, changeSet.id)
  return changeSet
}

async function getRuns(db: RequestDb, workspaceId: string) {
  const { data: runs, error } = await db
    .from('workspace_ai_runs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (isMissingAiSchema(error)) throw new Error('Workspace AI database tables are missing. Run sql/migrations/20260811_workspace_ai_agent.sql in Supabase, then reload the app.')
  if (error) throw error
  const runIds = ((runs || []) as any[]).map((run: any) => run.id)
  const { data: changeSets } = runIds.length
    ? await db.from('workspace_ai_change_sets').select('*').in('ai_run_id', runIds).order('created_at', { ascending: false })
    : { data: [] as any[] }
  const changeSetIds = ((changeSets || []) as any[]).map((changeSet: any) => changeSet.id)
  const { data: fileChanges } = changeSetIds.length
    ? await db.from('workspace_ai_file_changes').select('*').in('change_set_id', changeSetIds).order('created_at')
    : { data: [] as any[] }
  return { runs: runs || [], changeSets: changeSets || [], fileChanges: fileChanges || [] }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing project id' })
    const accessData = await access(req, id)

    if (req.method === 'GET') {
      const data = await getRuns(accessData.db, accessData.workspace.id)
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const mode = String(req.body.mode || 'ask').toLowerCase() as AiMode
      const prompt = String(req.body.prompt || '').trim()
      if (!aiModes.includes(mode)) return res.status(400).json({ error: 'Invalid AI mode' })
      if (!prompt) return res.status(400).json({ error: 'Missing prompt' })
      if (!canUseMode(accessData.member.permissions, mode)) return res.status(403).json({ error: 'Your workspace role cannot use this AI mode' })

      const run = await createRun({ db: accessData.db, workspaceId: accessData.workspace.id, userId: accessData.user.id, mode, prompt })
      await createActivity(accessData.db, accessData.group.id, accessData.user.id, 'ai_run_requested', { mode, prompt }, run.id)

      try {
        const files = await listFiles(accessData.db, accessData.workspace.id)
        const contextFiles = relevantFiles(prompt, files, req.body.active_file_id || null)
        const aiResult = await callOpenAi({
          mode,
          prompt,
          projectInfo: JSON.stringify({ group: accessData.group, idea: accessData.idea, workspace: accessData.workspace }),
          tree: files.map((file) => `${file.node_type === 'folder' ? '[dir]' : '[file]'} ${file.path} (${file.id}, v${file.version})`).join('\n'),
          files: contextFiles,
          selectedCode: req.body.selected_code,
        })
        const saved = await saveAiResult(run, accessData, files, aiResult)
        return res.status(200).json({ ...saved, contextFiles: contextFiles.map(({ id, path, version }) => ({ id, path, version })) })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI run failed'
        await accessData.db.from('workspace_ai_runs').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', run.id)
        throw error
      }
    }

    if (req.method === 'PATCH') {
      const action = String(req.body.action || '')
      const changeSetId = String(req.body.change_set_id || '')
      if (!changeSetId) return res.status(400).json({ error: 'Missing change set id' })
      if (action === 'accept') return res.status(200).json(await applyChangeSet(changeSetId, accessData))
      if (action === 'reject') return res.status(200).json({ changeSet: await rejectChangeSet(changeSetId, accessData) })
      if (action === 'cancel') {
        const runId = String(req.body.run_id || '')
        if (!runId) return res.status(400).json({ error: 'Missing run id' })
        const { data, error } = await accessData.db.from('workspace_ai_runs').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', runId).eq('workspace_id', accessData.workspace.id).select('*').single()
        if (error) throw error
        return res.status(200).json({ run: data })
      }
      return res.status(400).json({ error: 'Invalid action' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI workspace operation failed'
    return res.status(statusFor(error)).json({ error: message })
  }
}
