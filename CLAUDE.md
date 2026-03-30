# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `web/`:

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

No test framework is configured.

**Deploy:** `npx vercel --prod` from `web/` (git push does NOT auto-deploy).

**Manual job trigger:**
```bash
curl -X POST http://localhost:3000/api/jobs/extract-tasks \
  -H "x-jobs-secret: $EXTRACT_JOBS_SECRET"
```

## Architecture

Next.js App Router + Supabase (PostgreSQL + file storage). No component library — all UI is custom with Tailwind CSS 4.

**Four modules:**
- **Kanban** (`/`) — Task board (To Do / Discussed / Done). Drag-drop with native API. Tasks sorted by `position` (todo) or `updated_at DESC` (others).
- **Inbox** (`/inbox`) — AgentMail email messages. Cron jobs extract tasks via OpenAI GPT-4o-mini.
- **Links** (`/links`) — URLs extracted from emails, with OG image scraping.
- **Images** (`/images`) — Uploaded images + PDF-to-images. Supports cloning, crop, and markup annotation.

**Data flow:** AgentMail API → `agentmail_messages` table → extract-tasks job (OpenAI) → `tasks` table with tags.

## Key Patterns

**Two Supabase clients:**
- `getSupabaseBrowserClient()` in `lib/supabaseClient.ts` — anon key, RLS enforced (read-only for public)
- `getSupabaseServerClient()` in `lib/supabaseServer.ts` — service role key, bypasses RLS (all mutations)

**Task status normalization:** DB has `triage | todo | doing | done | archived | discussed`. The API normalizes `triage` and `doing` → `todo` before returning to the client.

**Image versioning:** Clones/crops reference `original_image_id` (self-join on `images` table). The "thread" (version list) in ImageDrawer is built client-side from `allImages` filtered by `original_image_id`, sorted by `created_at ASC` so version numbers stay stable.

**Job idempotency:** `agentmail_message_processing` table tracks processed message IDs. Pass `?reprocess=1` to force re-extraction.

**OG image fetching:** Site-specific URL patterns first (YouTube, Etsy CDN), then oEmbed, then HTML scrape for `og:image`.

**Tag system:** `tags` table (area/topic categories) + `tag_assignments` many-to-many. Areas = rooms/spaces; Topics = meta (Budget, Timeline, etc.).

## Environment Variables

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=          # also as NEXT_PUBLIC_SUPABASE_ANON_KEY for browser client
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
EXTRACT_JOBS_SECRET=        # header: x-jobs-secret for manual job triggers
AGENTMAIL_API_KEY=          # for ingest-agentmail job
SITE_PASSWORD=              # optional HTTP Basic Auth
```

## Supabase Schema

Run these in order in the Supabase SQL editor to set up a fresh instance:
1. `web/supabase/schema_tasks.sql` — tasks table + RLS
2. `web/supabase/schema_tags.sql` — tags + seed data (38 areas, 6 topics)
3. `web/supabase/migrations/` — apply all migration files in filename order

Storage bucket `images` must exist (public read, service-role write/delete).

## Non-Obvious Notes

- `web/src/lib/db/schema.ts` (Drizzle/SQLite) is legacy from an early prototype — it's unused; Supabase is the only database.
- The PDF worker requires a public asset at `/pdf.worker.min.mjs` to function.
- Vercel cron jobs are defined in `web/vercel.json` (extract-tasks every 15 min, ingest-agentmail every 15 min, dedupe-tasks nightly).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are what the browser client reads — keep them in sync with the server-side equivalents.
