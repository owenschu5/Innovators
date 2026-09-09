create table if not exists public.workspace_runtimes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  project_group_id uuid not null references public.idea_groups(id) on delete cascade,
  provider text not null default 'e2b',
  provider_runtime_id text,
  status text not null check (status in ('stopped','creating','syncing_files','installing','starting','running','failed')),
  project_kind text check (project_kind in ('static','vite')),
  preview_url text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  stopped_at timestamptz,
  expires_at timestamptz,
  last_activity_at timestamptz,
  error_summary text,
  log_tail text,
  source_snapshot_hash text
);

create index if not exists workspace_runtimes_workspace_created_idx on public.workspace_runtimes(workspace_id, created_at desc);
create unique index if not exists workspace_runtimes_one_active_per_workspace on public.workspace_runtimes(workspace_id) where status in ('creating','syncing_files','installing','starting','running');

alter table public.workspace_runtimes enable row level security;
create policy "runtimes visible to workspace members" on public.workspace_runtimes for select using (public.is_accepted_workspace_member(workspace_id));
create policy "runtimes created by contributors" on public.workspace_runtimes for insert with check (created_by = auth.uid() and public.can_edit_workspace(workspace_id));
create policy "runtimes updated by contributors" on public.workspace_runtimes for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
