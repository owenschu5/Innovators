create table if not exists public.project_workspaces (
  id uuid primary key default gen_random_uuid(),
  project_group_id uuid not null unique references public.idea_groups(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  parent_id uuid references public.workspace_nodes(id) on delete cascade,
  name text not null,
  node_type text not null check (node_type in ('file','folder')),
  content text,
  language text,
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, parent_id, name)
);

create table if not exists public.workspace_file_versions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.workspace_nodes(id) on delete cascade,
  version integer not null,
  content text not null,
  changed_by uuid references public.users(id),
  source text not null default 'autosave',
  created_at timestamptz not null default now(),
  unique(node_id, version)
);
