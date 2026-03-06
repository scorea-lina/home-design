# AgentMail → Supabase ingestion

This folder contains the host-side scripts that:

1) Poll AgentMail for new messages and append them to a JSONL log.
2) Forward new JSONL entries into Supabase (`agentmail_messages` table).
3) If messages include attachments, download them from AgentMail and upload them into **private** Supabase Storage.

These scripts are intended to run on the machine hosting OpenClaw (or any trusted server).

## Files

- `agentmail_poller.py`
  - Reads AgentMail via API
  - Appends to `AGENTMAIL_OUT_JSONL` (default: `~/.openclaw/workspace/inbox/agentmail.jsonl`)

- `agentmail_to_supabase.py`
  - Reads the JSONL log and upserts rows into Supabase table `agentmail_messages`
  - Tracks progress via a byte offset state file (default: `~/.openclaw/workspace/inbox/agentmail_supabase_state.json`)
  - Uploads attachments to Storage bucket (default bucket: `agentmail-attachments`, private)

## Environment variables

### AgentMail

- `AGENTMAIL_API_KEY_FILE` (default: `~/.openclaw/secrets/agentmail_api_key`)
- `AGENTMAIL_INBOX_ADDRESS` (default: `astratora@agentmail.to`)
- `AGENTMAIL_OUT_JSONL` (default: `~/.openclaw/workspace/inbox/agentmail.jsonl`)
- `AGENTMAIL_STATE_JSON` (default: `~/.openclaw/workspace/inbox/agentmail_state.json`)

### Supabase

Loaded from environment, and `agentmail_to_supabase.py` will also try to load a dotenv file at:
- `home-design/web/.env` (by default) if it exists

Required vars:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_ANON_KEY`

## Usage

### Poll AgentMail

```bash
python3 ops/agentmail/agentmail_poller.py
```

### Forward to Supabase (and upload attachments)

```bash
python3 ops/agentmail/agentmail_to_supabase.py --table agentmail_messages
```

### Backfill (reprocess from start)

This re-reads the JSONL file from byte offset 0 (safe due to upserts).

```bash
cp ~/.openclaw/workspace/inbox/agentmail_supabase_state.json \
   ~/.openclaw/workspace/inbox/agentmail_supabase_state.backup.json
printf '{"offset": 0}\n' > ~/.openclaw/workspace/inbox/agentmail_supabase_state.json
python3 ops/agentmail/agentmail_to_supabase.py --table agentmail_messages
```

## Notes

- Storage object keys are sanitized/encoded because some email message IDs contain characters not allowed by Supabase Storage.
- Bucket is created automatically (private) if missing.
