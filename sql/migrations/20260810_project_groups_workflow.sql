-- Approval-gated project group workflow.
-- This is safe to run on both an existing project and a fresh database.
create table if not exists public.idea_groups (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references public.ideas(id) on delete cascade,
  name text not null,
  created_by uuid references public.users(id),
  lead_user_id uuid references public.users(id),
  lead_name text,
  lead_email text,
  summary text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.idea_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.idea_groups(id) on delete cascade,
  member_name text not null,
  member_email text not null,
  member_role text,
  user_id uuid references public.users(id),
  is_lead boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.project_requests
  add column if not exists group_id uuid references public.idea_groups(id),
  add column if not exists requested_by uuid references public.users(id),
  add column if not exists request_notes text,
  add column if not exists admin_notes text,
  add column if not exists reviewed_at timestamptz;

alter table public.idea_groups
  add column if not exists build_target text,
  add column if not exists tech_stack text,
  add column if not exists github_repository text,
  add column if not exists admin_notes text,
  add column if not exists workspace_active boolean not null default false,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz;

alter table public.idea_group_members
  add column if not exists invitation_status text not null default 'invited',
  add column if not exists permissions text not null default 'contributor',
  add column if not exists responded_at timestamptz;

update public.idea_group_members
set invitation_status = 'accepted'
where is_lead = true or invitation_status is null;

create table if not exists project_activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.idea_groups(id) on delete cascade,
  actor_id uuid references public.users(id),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists project_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.idea_groups(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'backlog',
  priority text not null default 'normal',
  assigned_to uuid references public.users(id),
  due_date date,
  labels text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists project_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.idea_groups(id) on delete cascade,
  author_id uuid not null references public.users(id),
  parent_id uuid references project_messages(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists project_decisions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.idea_groups(id) on delete cascade,
  question text not null,
  context text,
  options text,
  final_decision text,
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
