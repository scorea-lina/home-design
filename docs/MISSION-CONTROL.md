# Mission Control (Ops dashboard)

Canonical deployment: `scorea-lina/scorea-lina-mission-control` running on tailnet.

- Base URL: https://astras-mac-mini.tail7d85b8.ts.net/

## Control-plane API (tasks)

The UI can be flaky; prefer the API for automation.

- `GET /api/tasks` (requires `x-api-key`)
- `PATCH /api/tasks/:id` (requires `x-api-key`) body: `{ "status": "assigned|in_progress|in_review|ready|done" }`
- Runtime store: `/Users/astratora/.openclaw/mission-control/tasks.json`

## Cron panel

Cron panel reads `GET /api/cron?action=list`. Some jobs are loop/adhoc and may not have a `schedule`.

## Auth

- Uses `x-api-key` for API endpoints (`API_KEY` env on the server).
- Login for UI remains unchanged (per product directive).
