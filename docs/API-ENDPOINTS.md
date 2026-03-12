# API Endpoints

List every `/api/*` route, what it does, and any auth required.

## Conventions
- Responses should be JSON with `{ ok: true|false, ... }`.
- If auth is required, document the header(s) and failure response.

## Endpoints (fill in)

### Jobs / ingestion
- `POST /api/jobs/agentmail/ingest` (example) — what it does, idempotency, auth

### Links
- `GET /api/links` — returns `{ ok, links: [] }`

### Images
- `GET /api/images` — returns `{ ok, images: [] }`

### Tasks
- `GET /api/tasks` — what it returns, auth
