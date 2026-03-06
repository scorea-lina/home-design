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

## Local data
- SQLite DB default location: `./data/app.db` (repo-root)
- Blob storage (planned): `./data/blobs/` (repo-root)

> Note: DB files are gitignored; `data/` itself is tracked.
