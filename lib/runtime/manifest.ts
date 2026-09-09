import { createHash } from 'node:crypto'
import type { RuntimeManifest } from './types'

type WorkspaceNode = { id: string; parent_id: string | null; name: string; node_type: 'file' | 'folder'; content?: string | null }
const MAX_FILES = 200
const MAX_TOTAL_BYTES = 5 * 1024 * 1024
const MAX_FILE_BYTES = 1024 * 1024

function safeSegment(value: string) {
  return Boolean(value) && !value.includes('\0') && !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..' && !value.includes('..')
}

export function buildManifest(nodes: WorkspaceNode[]): RuntimeManifest {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pathFor = (node: WorkspaceNode): string => {
    const parts = [node.name]
    let parentId = node.parent_id
    const seen = new Set<string>([node.id])
    while (parentId) {
      if (seen.has(parentId)) throw new Error('Invalid workspace path')
      seen.add(parentId)
      const parent = byId.get(parentId)
      if (!parent || parent.node_type !== 'folder') throw new Error('Invalid workspace path')
      parts.unshift(parent.name)
      parentId = parent.parent_id
    }
    if (!parts.every(safeSegment)) throw new Error('Invalid workspace path')
    return parts.join('/')
  }
  const files = nodes.filter((node) => node.node_type === 'file').map((node) => {
    const content = node.content || ''
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > MAX_FILE_BYTES) throw new Error(`File ${node.name} exceeds the 1 MB runtime limit.`)
    return { path: pathFor(node), content }
  })
  if (files.length > MAX_FILES) throw new Error('Workspace exceeds the 200-file runtime limit.')
  const totalBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0)
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Workspace exceeds the 5 MB runtime limit.')
  const snapshotHash = createHash('sha256').update(files.sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.path}\0${file.content}`).join('\0')).digest('hex')
  return { files, totalBytes, snapshotHash }
}
