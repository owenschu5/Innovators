# Innovators Platform — Stage 1 (Scaffold)

Quick scaffold for the Stage 1 MVP: Next.js + Supabase + Tailwind.

Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project and add the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_COLLAB_URL=ws://localhost:1234
OPENAI_API_KEY=your_server_side_openai_key
OPENAI_MODEL=gpt-4.1-mini
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_strong_admin_password
ADMIN_SESSION_SECRET=your_long_random_session_secret
```

3. Apply DB schema (using psql or Supabase SQL editor):

```bash
psql < sql/schema.sql
```

The admin portal lives at `/admin/login`. It reviews project move requests only for now; the later workspace and code-space creation flow can be layered on top of the approved requests.

Project Workspace features also require the migration files under `sql/migrations/`, including:

- `20260810_project_groups_workflow.sql`
- `20260810_workspace_files.sql`
- `20260811_workspace_ai_agent.sql`
- `20260811_workspace_phase1_foundation.sql`

The Build with AI panel uses the server-side `OPENAI_API_KEY`; never expose that key with a `NEXT_PUBLIC_` prefix.

4. Run dev server:

```bash
npm run dev
```
