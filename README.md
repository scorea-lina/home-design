# Home Design / Home Project Hub

Prototype repo for the Paradisa Home Project Hub (local-first, Tailscale-only).

## Quickstart (local)

Requirements:
- Node.js 20+ (works on the Mac mini)

Happy path:

```bash
git pull
cd web
npm install
npm run dev
# open http://localhost:3000
```

Notes:
- Kanban interactions are **in-memory** for the overnight prototype (state resets on refresh).

## Quickstart ("deployed-ish" via Docker) (optional)

Only if Docker is installed/running on the Mac mini:

```bash
docker compose up --build
# open http://localhost:3000
```

## Stable URLs (prototype)
- `/` (Kanban)
- `/inbox` and `/inbox/:id`
- `/search`
- `/transcripts` and `/transcripts/:id`
- `/canvas` and `/canvas/:assetId`
- `/settings`

## Demo: auto-extract emails → Kanban tasks (Supabase)

1) Create tables in Supabase
- Open the Supabase SQL editor and run:
  - `web/supabase/schema_tasks.sql`

2) Set env vars
```bash
cd web
cp .env.example .env.local
# set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and EXTRACT_JOBS_SECRET
```

3) Run the app
```bash
npm install
npm run dev
# open http://localhost:3000/
```

4) Trigger extraction (idempotent)
```bash
curl -X POST http://localhost:3000/api/jobs/extract-tasks \
  -H "x-jobs-secret: $EXTRACT_JOBS_SECRET"
```

Then refresh `/` — new cards should appear in **Triage**.

## Local data
- SQLite DB default location: `./data/app.db` (repo-root) (legacy; used for early scaffold)
- Blob storage (planned): `./data/blobs/` (repo-root)

> Note: DB files are gitignored; `data/` itself is tracked.

## Operating rules
- See `docs/OPERATING.md` for EngineerBot\x27s operating protocol (QA flow + 20-min update cadence).
