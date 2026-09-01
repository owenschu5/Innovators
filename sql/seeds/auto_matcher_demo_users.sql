-- Optional development-only matcher candidates. Do not run for a clean staging setup.
insert into public.users(id, email, profile_type, domains, skills, availability_status, weekly_availability)
values
  ('00000000-0000-4000-8000-0000000000a1', 'candidate.a.research@example.com', 'researcher', 'technology', 'Survey Design,Statistics,User Research', 'open', '2-5'),
  ('00000000-0000-4000-8000-0000000000b2', 'candidate.b.coder@example.com', 'coder', 'technology', 'React,TypeScript,Supabase', 'open', '5-10'),
  ('00000000-0000-4000-8000-0000000000c3', 'candidate.c.biology@example.com', 'researcher', 'biology', 'Biology,Lab Work,Microscopy', 'not_looking', '<2')
on conflict (email) do update
set
  profile_type = excluded.profile_type,
  domains = excluded.domains,
  skills = excluded.skills,
  availability_status = excluded.availability_status,
  weekly_availability = excluded.weekly_availability;
