create table if not exists public.workspace_ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  requested_by uuid not null references public.users(id),
  mode text not null,
  prompt text not null,
  status text not null default 'queued',
  model text,
  answer text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error text
);

create table if not exists public.workspace_ai_change_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  ai_run_id uuid not null references public.workspace_ai_runs(id) on delete cascade,
  requested_by uuid not null references public.users(id),
  status text not null default 'review_required',
  summary text,
  created_at timestamptz not null default now(),
  accepted_by uuid references public.users(id),
  accepted_at timestamptz,
  rejected_by uuid references public.users(id),
  rejected_at timestamptz
);

create table if not exists public.workspace_ai_file_changes (
  id uuid primary key default gen_random_uuid(),
  change_set_id uuid not null references public.workspace_ai_change_sets(id) on delete cascade,
  file_id uuid references public.workspace_nodes(id) on delete set null,
  operation text not null check (operation in ('create', 'modify', 'delete', 'rename')),
  original_path text,
  proposed_path text,
  base_version integer,
  previous_content text,
  proposed_content text,
  created_at timestamptz not null default now()
);

alter table public.project_activities
  add column if not exists ai_run_id uuid references public.workspace_ai_runs(id),
  add column if not exists ai_change_set_id uuid references public.workspace_ai_change_sets(id);
