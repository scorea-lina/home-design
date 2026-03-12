# Access & Tooling (non-secret)

This file describes what external systems HomeDesign uses and what tooling is expected to be available on the bot host.

## Systems
- **Vercel**: hosting + deploys
- **Supabase**: Postgres + Storage
- **Discord**: coordination channels

## Pre-provisioned tooling (bot host)
On the primary bot host (Astra’s Mac mini), the following CLIs are expected to be installed and authenticated:
- `vercel` (Vercel CLI)
- `supabase` (Supabase CLI)

**Rule:** do not ask “do we have access?” before attempting the CLI preflight and capturing the exact error.

## Preflight checks
- Vercel: `vercel whoami`
- Supabase: `supabase projects list`

If unsure: run `python3 tools/capcheck.py` from the OpenClaw workspace (never paste secrets).

## Process rules (external)
Bot operating protocols live in **bot-charter**:
- Skills + preflight rules: https://github.com/scorea-lina/bot-charter/blob/main/protocols/skills.md
- HomeDesign addendum: https://github.com/scorea-lina/bot-charter/blob/main/projects/home-design.md
