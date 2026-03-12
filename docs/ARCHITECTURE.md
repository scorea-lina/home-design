# Architecture

This document explains the HomeDesign app at a systems level: entities, data flow, and sources of truth.

## Sources of truth
- **Supabase (Postgres)** is the primary system of record for ingested content.
- The web app reads from Supabase and renders boards/pages.

## Core entities (conceptual)
- **AgentMail message**: raw inbound email + metadata.
- **Task**: normalized work item derived from messages.
- **(Future) Link**: extracted URL entity.
- **(Future) Image**: extracted image entity.

## Key flows

### Ingestion
1) Poll AgentMail inbox
2) Append to local JSONL for audit
3) Forward new lines into Supabase

### UI
- Kanban board shows tasks/cards sorted by email timestamp.
- Inbox page shows raw/normalized messages.

## Operational note
Process/behavior rules live in **bot-charter**. This repo contains concrete runbooks only.
