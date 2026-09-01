-- Workspace RLS hardening. Apply after the existing workspace migrations.
-- Request-scoped API clients now execute as auth.uid(); the collaboration server
-- uses the service role only after authenticating and authorizing each connection.

create or replace function public.is_accepted_project_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.idea_group_members member
    where member.group_id = target_group_id
      and member.user_id = auth.uid()
      and member.invitation_status = 'accepted'
  );
$$;

create or replace function public.is_project_manager(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.idea_group_members member
    where member.group_id = target_group_id
      and member.user_id = auth.uid()
      and member.invitation_status = 'accepted'
      and (member.is_lead = true or member.permissions in ('admin', 'owner', 'lead', 'project_lead'))
  );
$$;

create or replace function public.is_accepted_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_workspaces workspace
    where workspace.id = target_workspace_id
      and public.is_accepted_project_member(workspace.project_group_id)
  );
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_workspaces workspace
    join public.idea_group_members member on member.group_id = workspace.project_group_id
    where workspace.id = target_workspace_id
      and member.user_id = auth.uid()
      and member.invitation_status = 'accepted'
      and member.permissions <> 'viewer'
  );
$$;

alter table public.project_workspaces enable row level security;
alter table public.workspace_objectives enable row level security;
alter table public.project_tasks enable row level security;
alter table public.workspace_nodes enable row level security;
alter table public.workspace_file_versions enable row level security;
alter table public.workspace_ai_runs enable row level security;
alter table public.workspace_ai_change_sets enable row level security;
alter table public.workspace_ai_file_changes enable row level security;

drop policy if exists "workspaces visible to accepted members" on public.project_workspaces;
create policy "workspaces visible to accepted members" on public.project_workspaces for select using (public.is_accepted_project_member(project_group_id));
drop policy if exists "workspaces initialized by accepted members" on public.project_workspaces;
create policy "workspaces initialized by accepted members" on public.project_workspaces for insert with check (public.is_accepted_project_member(project_group_id));
drop policy if exists "workspaces editable by contributors" on public.project_workspaces;
create policy "workspaces editable by contributors" on public.project_workspaces for update using (public.can_edit_workspace(id)) with check (public.can_edit_workspace(id));

drop policy if exists "objectives visible to workspace members" on public.workspace_objectives;
create policy "objectives visible to workspace members" on public.workspace_objectives for select using (public.is_accepted_workspace_member(workspace_id));
drop policy if exists "objectives created by contributors" on public.workspace_objectives;
create policy "objectives created by contributors" on public.workspace_objectives for insert with check (created_by = auth.uid() and public.can_edit_workspace(workspace_id));
drop policy if exists "objectives edited by contributors" on public.workspace_objectives;
create policy "objectives edited by contributors" on public.workspace_objectives for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
drop policy if exists "objectives deleted by contributors" on public.workspace_objectives;
create policy "objectives deleted by contributors" on public.workspace_objectives for delete using (public.can_edit_workspace(workspace_id));

drop policy if exists "tasks visible to workspace members" on public.project_tasks;
create policy "tasks visible to workspace members" on public.project_tasks for select using (public.is_accepted_workspace_member(workspace_id));
drop policy if exists "tasks created by contributors" on public.project_tasks;
create policy "tasks created by contributors" on public.project_tasks for insert with check (created_by = auth.uid() and public.can_edit_workspace(workspace_id));
drop policy if exists "tasks edited by contributors" on public.project_tasks;
create policy "tasks edited by contributors" on public.project_tasks for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
drop policy if exists "tasks deleted by contributors" on public.project_tasks;
create policy "tasks deleted by contributors" on public.project_tasks for delete using (public.can_edit_workspace(workspace_id));

drop policy if exists "workspace files visible to members" on public.workspace_nodes;
create policy "workspace files visible to members" on public.workspace_nodes for select using (public.is_accepted_workspace_member(workspace_id));
drop policy if exists "workspace files created by contributors" on public.workspace_nodes;
create policy "workspace files created by contributors" on public.workspace_nodes for insert with check (created_by = auth.uid() and public.can_edit_workspace(workspace_id));
drop policy if exists "workspace files edited by contributors" on public.workspace_nodes;
create policy "workspace files edited by contributors" on public.workspace_nodes for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
drop policy if exists "workspace files deleted by contributors" on public.workspace_nodes;
create policy "workspace files deleted by contributors" on public.workspace_nodes for delete using (public.can_edit_workspace(workspace_id));

drop policy if exists "file versions visible to workspace members" on public.workspace_file_versions;
create policy "file versions visible to workspace members" on public.workspace_file_versions for select using (exists (select 1 from public.workspace_nodes node where node.id = workspace_file_versions.node_id and public.is_accepted_workspace_member(node.workspace_id)));
drop policy if exists "file versions created by contributors" on public.workspace_file_versions;
create policy "file versions created by contributors" on public.workspace_file_versions for insert with check (changed_by = auth.uid() and exists (select 1 from public.workspace_nodes node where node.id = workspace_file_versions.node_id and public.can_edit_workspace(node.workspace_id)));

drop policy if exists "ai runs visible to workspace members" on public.workspace_ai_runs;
create policy "ai runs visible to workspace members" on public.workspace_ai_runs for select using (public.is_accepted_workspace_member(workspace_id));
drop policy if exists "ai runs created by requester" on public.workspace_ai_runs;
create policy "ai runs created by requester" on public.workspace_ai_runs for insert with check (requested_by = auth.uid() and public.is_accepted_workspace_member(workspace_id));
drop policy if exists "ai runs updated by workspace members" on public.workspace_ai_runs;
create policy "ai runs updated by workspace members" on public.workspace_ai_runs for update using (public.is_accepted_workspace_member(workspace_id)) with check (public.is_accepted_workspace_member(workspace_id));

drop policy if exists "ai change sets visible to workspace members" on public.workspace_ai_change_sets;
create policy "ai change sets visible to workspace members" on public.workspace_ai_change_sets for select using (public.is_accepted_workspace_member(workspace_id));
drop policy if exists "ai change sets created by requester" on public.workspace_ai_change_sets;
create policy "ai change sets created by requester" on public.workspace_ai_change_sets for insert with check (requested_by = auth.uid() and public.can_edit_workspace(workspace_id));
drop policy if exists "ai change sets updated by contributors" on public.workspace_ai_change_sets;
create policy "ai change sets updated by contributors" on public.workspace_ai_change_sets for update using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));

drop policy if exists "ai file changes visible through change set" on public.workspace_ai_file_changes;
create policy "ai file changes visible through change set" on public.workspace_ai_file_changes for select using (exists (select 1 from public.workspace_ai_change_sets change_set where change_set.id = workspace_ai_file_changes.change_set_id and public.is_accepted_workspace_member(change_set.workspace_id)));
drop policy if exists "ai file changes created by contributors" on public.workspace_ai_file_changes;
create policy "ai file changes created by contributors" on public.workspace_ai_file_changes for insert with check (exists (select 1 from public.workspace_ai_change_sets change_set where change_set.id = workspace_ai_file_changes.change_set_id and public.can_edit_workspace(change_set.workspace_id)));
