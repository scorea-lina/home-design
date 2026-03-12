# Operations / Runbooks

## Key URLs

- QA alias: https://web-qa-gamma.vercel.app
- Prod: https://web-seven-phi-52.vercel.app (Basic Auth)

## Jobs / Ingest

### Vercel Cron

- Vercel cron hits endpoints via **GET** and sends header `x-vercel-cron: 1`.
- Job endpoints also accept bearer auth with `Authorization: Bearer $CRON_SECRET`.

### Task extraction job

- Endpoint: `/api/jobs/extract-tasks`
- Non-destructive reprocess: `?reprocess=1` must preserve manual edits/tags.

### Images ingest

- Dry run endpoint (shipped): `/api/jobs/ingest-images-dry-run`
- Persistent ingest (planned / Slice 2): `/api/jobs/ingest-images` + `public.images`.

## Secrets

- Never put `SUPABASE_SERVICE_ROLE_KEY` in client code.
- Never paste secrets into Discord.
- Use Vercel env vars for runtime secrets.
