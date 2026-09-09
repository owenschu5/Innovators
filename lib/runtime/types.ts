export type RuntimeStatus = 'stopped' | 'creating' | 'syncing_files' | 'installing' | 'starting' | 'running' | 'failed'
export type ProjectKind = 'static' | 'vite'

export type RuntimeFile = { path: string; content: string }
export type RuntimeManifest = { files: RuntimeFile[]; totalBytes: number; snapshotHash: string }
export type RuntimeRecord = {
  id: string
  workspace_id: string
  project_group_id: string
  provider: string
  provider_runtime_id: string | null
  status: RuntimeStatus
  project_kind: ProjectKind | null
  preview_url: string | null
  error_summary: string | null
  log_tail: string | null
  expires_at: string | null
  last_activity_at: string | null
  created_at: string
}

export type DetectedProject = { kind: ProjectKind; port: number }
