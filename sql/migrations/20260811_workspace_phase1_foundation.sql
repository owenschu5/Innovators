alter table public.project_workspaces
  add column if not exists current_stage text not null default 'define',
  add column if not exists goals text,
  add column if not exists problem_statement text,
  add column if not exists stage_updated_by uuid references public.users(id),
  add column if not exists stage_updated_at timestamptz;

create table if not exists public.workspace_objectives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'proposed',
  priority text not null default 'medium',
  owner_id uuid references public.users(id),
  created_by uuid references public.users(id),
  stage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_tasks
  add column if not exists workspace_id uuid references public.project_workspaces(id) on delete cascade,
  add column if not exists objective_id uuid references public.workspace_objectives(id) on delete set null,
  add column if not exists stage text,
  add column if not exists suggested_role text not null default 'any',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists workspace_objectives_workspace_idx
  on public.workspace_objectives(workspace_id);

create index if not exists workspace_objectives_status_idx
  on public.workspace_objectives(status);

create index if not exists project_tasks_workspace_idx
  on public.project_tasks(workspace_id);

create index if not exists project_tasks_objective_idx
  on public.project_tasks(objective_id);

create index if not exists project_tasks_suggested_role_idx
  on public.project_tasks(suggested_role);
