# QA + Release Process (HomeDesign)

This repo ships incrementally via **PR → QA → merge → prod**.

## Environments

- **QA alias (always use for Tester QA):** https://web-qa-gamma.vercel.app
  - No Basic Auth.
  - Note: QA and prod share the **same Supabase DB instance**.

- **Prod (Basic Auth protected):** https://web-seven-phi-52.vercel.app

## Definition of “Ready for QA”

When engineering believes a PR is ready:

1. Deploy to **QA project**.
2. Post in **#hd-team** and tag **TesterBot** with:
   - PR link
   - QA alias URL
   - Direct deploy URL (in case alias hasn’t flipped yet)
   - 3–5 step QA checklist

## After QA PASS

Default rule:

1. Merge PR to `main`
2. Deploy to prod
3. Post in **#hd-pm** with:
   - merge commit SHA
   - prod URL
   - any verification notes

## Notes / gotchas

- Vercel scheduled cron requests are **GET** with header `x-vercel-cron: 1`.
- Do not post secrets in chat.
- DB migrations require explicit approval (shared DB across envs).
