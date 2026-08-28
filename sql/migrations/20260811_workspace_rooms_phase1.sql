-- Project Rooms: realtime multidisciplinary collaboration layer.
-- Run after 20260810_workspace_files.sql and 20260811_workspace_phase1_foundation.sql.

create table if not exists public.workspace_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  type text not null default 'custom',
  role_type text,
  objective_id uuid references public.workspace_objectives(id) on delete cascade,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(workspace_id, slug)
);

create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.workspace_rooms(id) on delete cascade,
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id),
  content text not null,
  parent_message_id uuid references public.workspace_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid references public.users(id)
);

create table if not exists public.workspace_room_reads (
  workspace_id uuid not null references public.project_workspaces(id) on delete cascade,
  room_id uuid not null references public.workspace_rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key(room_id, user_id)
);

create index if not exists workspace_rooms_workspace_idx
  on public.workspace_rooms(workspace_id);

create index if not exists workspace_rooms_objective_idx
  on public.workspace_rooms(objective_id);

create index if not exists workspace_messages_room_created_idx
  on public.workspace_messages(room_id, created_at desc);

create index if not exists workspace_messages_workspace_created_idx
  on public.workspace_messages(workspace_id, created_at desc);

create index if not exists workspace_messages_parent_idx
  on public.workspace_messages(parent_message_id);

create index if not exists workspace_room_reads_user_idx
  on public.workspace_room_reads(user_id);

alter table public.workspace_rooms enable row level security;
alter table public.workspace_messages enable row level security;
alter table public.workspace_room_reads enable row level security;

drop policy if exists "workspace rooms visible to accepted project members" on public.workspace_rooms;
create policy "workspace rooms visible to accepted project members"
  on public.workspace_rooms for select
  using (
    exists (
      select 1
      from public.project_workspaces workspace
      join public.idea_group_members member on member.group_id = workspace.project_group_id
      where workspace.id = workspace_rooms.workspace_id
        and member.user_id = auth.uid()
        and member.invitation_status = 'accepted'
    )
  );

drop policy if exists "workspace rooms created by accepted project members" on public.workspace_rooms;
create policy "workspace rooms created by accepted project members"
  on public.workspace_rooms for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.project_workspaces workspace
      join public.idea_group_members member on member.group_id = workspace.project_group_id
      where workspace.id = workspace_rooms.workspace_id
        and member.user_id = auth.uid()
        and member.invitation_status = 'accepted'
        and member.permissions <> 'viewer'
    )
  );

drop policy if exists "workspace messages visible to accepted project members" on public.workspace_messages;
create policy "workspace messages visible to accepted project members"
  on public.workspace_messages for select
  using (
    exists (
      select 1
      from public.project_workspaces workspace
      join public.idea_group_members member on member.group_id = workspace.project_group_id
      where workspace.id = workspace_messages.workspace_id
        and member.user_id = auth.uid()
        and member.invitation_status = 'accepted'
    )
  );

drop policy if exists "workspace messages created by accepted project members" on public.workspace_messages;
create policy "workspace messages created by accepted project members"
  on public.workspace_messages for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.workspace_rooms room
      join public.project_workspaces workspace on workspace.id = room.workspace_id
      join public.idea_group_members member on member.group_id = workspace.project_group_id
      where room.id = workspace_messages.room_id
        and room.workspace_id = workspace_messages.workspace_id
        and room.archived_at is null
        and member.user_id = auth.uid()
        and member.invitation_status = 'accepted'
        and member.permissions <> 'viewer'
        and (
          room.type <> 'announcement'
          or member.is_lead = true
          or member.permissions in ('admin', 'owner', 'lead')
        )
    )
  );

drop policy if exists "workspace room reads visible to owner" on public.workspace_room_reads;
create policy "workspace room reads visible to owner"
  on public.workspace_room_reads for select
  using (user_id = auth.uid());

drop policy if exists "workspace room reads upserted by owner" on public.workspace_room_reads;
create policy "workspace room reads upserted by owner"
  on public.workspace_room_reads for insert
  with check (user_id = auth.uid());

drop policy if exists "workspace room reads updated by owner" on public.workspace_room_reads;
create policy "workspace room reads updated by owner"
  on public.workspace_room_reads for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.workspace_rooms replica identity full;
alter table public.workspace_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.workspace_rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.workspace_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
