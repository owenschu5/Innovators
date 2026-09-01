-- Auto Matcher Phase 1: structured skills, availability, and project needs.

alter table public.users
  add column if not exists availability_status text not null default 'open',
  add column if not exists weekly_availability text,
  add column if not exists skills text;

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_skills (
  user_id uuid not null references public.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, skill_id)
);

create table if not exists public.project_role_needs (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references public.ideas(id) on delete cascade,
  group_id uuid references public.idea_groups(id) on delete cascade,
  project_request_id uuid references public.project_requests(id) on delete cascade,
  role text not null,
  priority text not null default 'preferred',
  desired_count int not null default 1,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_skill_needs (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references public.ideas(id) on delete cascade,
  group_id uuid references public.idea_groups(id) on delete cascade,
  project_request_id uuid references public.project_requests(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  skill_name text not null,
  priority text not null default 'preferred',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_skills_user_idx on public.user_skills(user_id);
create index if not exists user_skills_skill_idx on public.user_skills(skill_id);
create index if not exists project_role_needs_idea_idx on public.project_role_needs(idea_id);
create index if not exists project_role_needs_group_idx on public.project_role_needs(group_id);
create index if not exists project_skill_needs_idea_idx on public.project_skill_needs(idea_id);
create index if not exists project_skill_needs_group_idx on public.project_skill_needs(group_id);

insert into public.skills(name, category)
values
  ('React', 'Coder'),
  ('TypeScript', 'Coder'),
  ('JavaScript', 'Coder'),
  ('Python', 'Coder'),
  ('Supabase', 'Coder'),
  ('PostgreSQL', 'Coder'),
  ('Machine Learning', 'Coder'),
  ('APIs', 'Coder'),
  ('Node.js', 'Coder'),
  ('SQL', 'Coder'),
  ('Literature Review', 'Researcher'),
  ('Statistics', 'Researcher'),
  ('Survey Design', 'Researcher'),
  ('User Interviews', 'Researcher'),
  ('Experimental Design', 'Researcher'),
  ('Data Analysis', 'Researcher'),
  ('Scientific Writing', 'Researcher'),
  ('UI Design', 'Designer'),
  ('UX Research', 'Designer'),
  ('Wireframing', 'Designer'),
  ('Figma', 'Designer'),
  ('Graphic Design', 'Designer'),
  ('User Flows', 'Designer'),
  ('Accessibility', 'Designer'),
  ('Prototyping', 'Builder'),
  ('Hardware', 'Builder'),
  ('Electronics', 'Builder'),
  ('CAD', 'Builder'),
  ('Fabrication', 'Builder'),
  ('Systems Integration', 'Builder'),
  ('Testing', 'Builder'),
  ('No-Code Tools', 'Builder'),
  ('Systems Thinking', 'Thinker'),
  ('Strategy', 'Thinker'),
  ('Problem Definition', 'Thinker'),
  ('Requirements', 'Thinker'),
  ('Policy Analysis', 'Thinker'),
  ('Ethics', 'Thinker'),
  ('Architecture', 'Thinker'),
  ('Critical Analysis', 'Thinker'),
  ('Market Research', 'Entrepreneur'),
  ('Business Models', 'Entrepreneur'),
  ('Sales', 'Entrepreneur'),
  ('Fundraising', 'Entrepreneur'),
  ('Partnerships', 'Entrepreneur'),
  ('Financial Modeling', 'Entrepreneur'),
  ('Customer Discovery', 'Entrepreneur'),
  ('Marketing', 'Entrepreneur')
on conflict (name) do nothing;
