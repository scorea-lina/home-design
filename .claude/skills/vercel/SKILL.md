---
name: vercel
description: Run Vercel CLI commands for deploying and managing the app. Use when the user wants to deploy, check deployments, view logs, or manage the Vercel project.
disable-model-invocation: true
---

# Vercel CLI Skill

Run Vercel CLI commands for the home-design project.

## Project Info
- The Next.js app lives in the `web/` directory
- Always run vercel commands from the `web/` directory

## Usage
The user will pass a subcommand as `$ARGUMENTS`. Common subcommands:

- `deploy` or `prod` → `npx vercel --prod --yes`
- `preview` → `npx vercel --yes` (creates a preview deployment)
- `ls` → `npx vercel ls` (list recent deployments)
- `logs` → `npx vercel logs` (show deployment logs)
- `env` → `npx vercel env ls` (list environment variables)
- `inspect <url>` → `npx vercel inspect <url>`
- Any other args → pass directly to `npx vercel $ARGUMENTS`

## Instructions

1. `cd` into the `web/` directory before running any vercel command
2. Map the subcommand from `$ARGUMENTS` to the appropriate vercel CLI command using the table above
3. If `$ARGUMENTS` is empty, default to `npx vercel --prod` (production deploy)
4. If the user is not logged in (credentials error), tell them to run `npx vercel login` in their terminal first — it requires browser auth
5. Show the deployment URL when a deploy completes
