# Home Design / Home Project Hub

Prototype repo for the Paradisa Home Project Hub (local-first, Tailscale-only).

## Quickstart (local)

Requirements:
- Node.js 20+ (works on the Mac mini)

```bash
cd web
npm install
npm run dev
```

Open: http://localhost:3000

## Quickstart ("deployed-ish" via Docker)

```bash
docker compose up --build
```

Open: http://localhost:3000

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
