-- Basic schema for Stage 1
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  profile_type text,
  created_at timestamptz default now(),
  last_active timestamptz default now()
);

create table if not exists domains (
  id serial primary key,
  name text unique
);

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references users(id),
  domain_id int references domains(id),
  title text,
  description text,
  problem_statement text,
  goals text,
  evidence text,
  status text default 'active',
  created_at timestamptz default now(),
  last_activity timestamptz default now()
);

create table if not exists idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references ideas(id),
  author_id uuid references users(id),
  parent_comment_id uuid,
  content text,
  flagged boolean default false,
  created_at timestamptz default now()
);

create table if not exists idea_forks (
  id uuid primary key default gen_random_uuid(),
  original_idea_id uuid references ideas(id),
  forked_idea_id uuid references ideas(id),
  fork_reason text,
  created_at timestamptz default now()
);

create table if not exists project_requests (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references ideas(id),
  lead_id uuid references users(id),
  goals text,
  outcomes text,
  timeline text,
  location text,
  evidence_data text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists idea_groups (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references ideas(id),
  name text not null,
  created_by uuid references users(id),
  lead_user_id uuid references users(id),
  lead_name text,
  lead_email text,
  summary text,
  status text default 'forming',
  created_at timestamptz default now()
);

create table if not exists idea_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references idea_groups(id) on delete cascade,
  member_name text,
  member_email text,
  member_role text,
  user_id uuid references users(id),
  is_lead boolean default false,
  created_at timestamptz default now()
);

alter table users add column if not exists domains text;
alter table project_requests add column if not exists group_id uuid references idea_groups(id);
alter table project_requests add column if not exists requested_by uuid references users(id);
alter table project_requests add column if not exists request_notes text;
alter table project_requests add column if not exists admin_notes text;
alter table project_requests add column if not exists reviewed_at timestamptz;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  type text,
  related_idea_id uuid,
  read boolean default false,
  created_at timestamptz default now()
);
