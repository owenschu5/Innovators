-- Run this migration against the connected Supabase project.
-- The profile API stores a member's selected areas of interest here.
alter table public.users add column if not exists domains text;
