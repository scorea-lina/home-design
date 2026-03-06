# Supabase setup (local dev)

The web app uses Supabase for persistence.

## 1) Create your local env file

From repo root:

```bash
cd web
cp .env.example .env
```

Then edit `web/.env` and fill in values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(server-only; never expose to the client)*

> Note: `web/.env` is **gitignored** and should never be committed.

## 2) Run the web app

```bash
cd web
npm install
npm run dev
```

## 3) Verify Supabase connectivity

If the app starts, Next will print:

- `Environments: .env`

If Inbox is wired to Supabase, the Inbox page should render items from the table:

- `public.agentmail_messages`

## Troubleshooting

- If you see "missing SUPABASE_URL" errors, confirm `web/.env` exists and is populated.
- If you see RLS/permission errors, ensure server routes use `SUPABASE_SERVICE_ROLE_KEY` and client uses only `SUPABASE_ANON_KEY`.
