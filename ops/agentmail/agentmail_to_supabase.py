#!/usr/bin/env python3
"""Forward AgentMail JSONL log entries into Supabase.

Reads:  ~/.openclaw/workspace/inbox/agentmail.jsonl
Writes: ~/.openclaw/workspace/inbox/agentmail_supabase_state.json

Auth:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY

By default, loads env vars from: home-design/web/.env (if present)

Usage:
  python3 tools/agentmail_to_supabase.py --dry-run
  python3 tools/agentmail_to_supabase.py --table agentmail_messages
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import base64
import urllib.parse
import urllib.request

import requests

WORKSPACE = Path(os.path.expanduser("~/.openclaw/workspace"))
INBOX_JSONL = WORKSPACE / "inbox" / "agentmail.jsonl"
STATE_PATH = WORKSPACE / "inbox" / "agentmail_supabase_state.json"
DEFAULT_ENV_PATH = WORKSPACE / "home-design" / "web" / ".env"

# Supabase Storage
DEFAULT_BUCKET = "agentmail-attachments"


def load_dotenv_if_present(path: Path) -> None:
    if not path.exists():
        return
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            # don't clobber real env
            if k and k not in os.environ:
                os.environ[k] = v.strip()
    except Exception as e:
        print(f"[agentmail_to_supabase] warning: failed to read {path}: {e}", file=sys.stderr)


@dataclass
class SupabaseConfig:
    url: str
    key: str


def get_supabase_config() -> SupabaseConfig:
    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_ANON_KEY", "").strip()
    )
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is not set")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) is not set")
    return SupabaseConfig(url=supabase_url, key=key)


def read_state() -> Dict[str, Any]:
    if not STATE_PATH.exists():
        return {"offset": 0}
    return json.loads(STATE_PATH.read_text())


def write_state(state: Dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
    tmp.replace(STATE_PATH)


def supabase_upsert(
    cfg: SupabaseConfig,
    table: str,
    row: Dict[str, Any],
    *,
    on_conflict: str = "message_id",
    dry_run: bool = False,
    timeout_s: int = 30,
) -> Tuple[int, str]:
    # REST API: POST /rest/v1/<table>?on_conflict=...
    url = f"{cfg.url}/rest/v1/{table}?on_conflict={on_conflict}"

    body = json.dumps(row).encode("utf-8")
    headers = {
        "apikey": cfg.key,
        "Authorization": f"Bearer {cfg.key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    if dry_run:
        return (0, "DRY_RUN")

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return (resp.status, resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        # Include response body if it's an HTTPError
        if hasattr(e, "code") and hasattr(e, "read"):
            try:
                return (int(e.code), e.read().decode("utf-8", errors="replace"))
            except Exception:
                pass
        raise


def ensure_bucket(cfg: SupabaseConfig, bucket: str, *, public: bool = False, dry_run: bool = False) -> None:
    """Create bucket if missing."""
    if dry_run:
        return
    base = f"{cfg.url}/storage/v1"
    headers = {"Authorization": f"Bearer {cfg.key}", "apikey": cfg.key, "Content-Type": "application/json"}

    # Check existing
    r = requests.get(f"{base}/bucket", headers=headers, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase storage bucket list failed {r.status_code}: {r.text[:200]}")
    buckets = r.json() if isinstance(r.json(), list) else []
    if any(b.get("name") == bucket for b in buckets if isinstance(b, dict)):
        return

    # Create
    payload = {"name": bucket, "public": public}
    rc = requests.post(f"{base}/bucket", headers=headers, data=json.dumps(payload), timeout=30)
    if rc.status_code not in (200, 201):
        # Might be race/exists
        if rc.status_code == 409:
            return
        raise RuntimeError(f"Supabase storage bucket create failed {rc.status_code}: {rc.text[:200]}")


def supabase_storage_upload(
    cfg: SupabaseConfig,
    bucket: str,
    path: str,
    data: bytes,
    *,
    content_type: str = "application/octet-stream",
    upsert: bool = True,
    dry_run: bool = False,
) -> None:
    if dry_run:
        return
    base = f"{cfg.url}/storage/v1"
    qp = "?upsert=true" if upsert else ""
    url = f"{base}/object/{bucket}/{urllib.parse.quote(path)}{qp}"
    headers = {
        "Authorization": f"Bearer {cfg.key}",
        "apikey": cfg.key,
        "Content-Type": content_type or "application/octet-stream",
    }
    r = requests.post(url, headers=headers, data=data, timeout=60)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Supabase storage upload failed {r.status_code}: {r.text[:300]}")


def agentmail_get_attachment(
    agentmail_key: str,
    inbox_id: str,
    message_id: str,
    attachment_id: str,
) -> bytes:
    url = f"https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/{urllib.parse.quote(message_id)}/attachments/{attachment_id}"
    r = requests.get(url, headers={"Authorization": f"Bearer {agentmail_key}"}, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"AgentMail attachment download failed {r.status_code}: {r.text[:200]}")
    return r.content


def extract_attachments(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict) and isinstance(raw.get("attachments"), list):
        return [a for a in raw["attachments"] if isinstance(a, dict)]
    return []


def safe_key_part(s: str) -> str:
    """Return a Storage-safe key component.

    Supabase Storage object keys reject some characters (e.g. '<', '>').
    We use urlsafe base64 for high-entropy ids and a conservative scrub for filenames.
    """
    if s is None:
        return ""
    s = str(s)
    # For message ids / inbox ids which can contain '<', '>', '@', etc.
    b = base64.urlsafe_b64encode(s.encode("utf-8")).decode("ascii").rstrip("=")
    return b


def safe_filename(name: str) -> str:
    name = str(name or "file")
    # keep it readable but remove path separators and angle brackets
    bad = set('/\\<>:"|?*')
    out = "".join((c if (c.isalnum() or c in " ._-()") and c not in bad else "_") for c in name)
    out = out.strip() or "file"
    return out[:200]


def normalize_row(obj: Dict[str, Any]) -> Dict[str, Any]:
    # Keep a stable primary key for dedupe.
    message_id = obj.get("message_id")
    if not message_id:
        # fall back to smtp_id or synthetic key
        message_id = obj.get("raw", {}).get("smtp_id") or f"ts:{obj.get('ts')}:{obj.get('thread_id')}"

    return {
        "message_id": message_id,
        "thread_id": obj.get("thread_id"),
        "inbox_address": obj.get("inbox_address") or obj.get("inbox_id"),
        "from": obj.get("from"),
        "to": obj.get("to"),
        "subject": obj.get("subject"),
        "ts": obj.get("ts"),
        "fetched_at": obj.get("fetched_at"),
        "text": obj.get("text"),
        "raw": obj.get("raw"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="agentmail_messages")
    ap.add_argument("--env", default=str(DEFAULT_ENV_PATH))
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max", type=int, default=500)
    args = ap.parse_args()

    load_dotenv_if_present(Path(args.env))
    cfg = get_supabase_config()

    # Ensure the (private) Storage bucket exists for AgentMail attachments.
    ensure_bucket(cfg, args.bucket, public=False, dry_run=args.dry_run)

    if not INBOX_JSONL.exists():
        print(f"[agentmail_to_supabase] missing inbox log: {INBOX_JSONL}", file=sys.stderr)
        return 2

    state = read_state()
    offset = int(state.get("offset", 0))

    sent = 0
    new_offset = offset

    agentmail_key: Optional[str] = None
    agentmail_key_file = Path(os.environ.get("AGENTMAIL_API_KEY_FILE", os.path.expanduser("~/.openclaw/secrets/agentmail_api_key")))

    with INBOX_JSONL.open("rb") as f:
        f.seek(offset)
        while sent < args.max:
            line = f.readline()
            if not line:
                break
            new_offset = f.tell()
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            row = normalize_row(obj)

            # Attachment handling: download from AgentMail, upload to Supabase Storage,
            # and record uploaded paths inside the raw message payload.
            raw = row.get("raw")
            attachments = extract_attachments(raw)
            if attachments:
                if agentmail_key is None:
                    agentmail_key = agentmail_key_file.read_text().strip()
                    if not agentmail_key:
                        raise RuntimeError(f"Empty AgentMail API key file: {agentmail_key_file}")

                inbox_id = str(obj.get("inbox_id") or obj.get("raw", {}).get("inbox_id") or "")
                message_id = str(row.get("message_id") or obj.get("message_id") or "")
                thread_id = str(obj.get("thread_id") or "")

                inbox_key = safe_key_part(inbox_id or obj.get("inbox_address") or "")
                msg_key = safe_key_part(message_id)

                uploaded: list[dict[str, Any]] = []
                for att in attachments:
                    attachment_id = str(att.get("attachment_id") or att.get("id") or "")
                    if not attachment_id:
                        continue
                    filename = safe_filename(str(att.get("filename") or att.get("name") or attachment_id))
                    content_type = str(att.get("content_type") or att.get("contentType") or "application/octet-stream")

                    data = agentmail_get_attachment(agentmail_key, inbox_id, message_id, attachment_id)
                    storage_path = f"inbox/{inbox_key}/thread/{thread_id}/message/{msg_key}/{attachment_id}/{filename}"
                    supabase_storage_upload(cfg, args.bucket, storage_path, data, content_type=content_type, dry_run=args.dry_run)

                    uploaded.append(
                        {
                            "attachment_id": attachment_id,
                            "filename": filename,
                            "content_type": content_type,
                            "size_bytes": len(data),
                            "bucket": args.bucket,
                            "path": storage_path,
                        }
                    )

                if uploaded and isinstance(raw, dict):
                    raw = dict(raw)
                    raw.setdefault("supabase_storage", {})
                    if isinstance(raw["supabase_storage"], dict):
                        raw["supabase_storage"]["bucket"] = args.bucket
                        raw["supabase_storage"]["attachments"] = uploaded
                    row["raw"] = raw

            # Upsert one row at a time to keep behavior simple/robust.
            status, resp_body = supabase_upsert(cfg, args.table, row, dry_run=args.dry_run)
            if status not in (0, 200, 201):
                raise RuntimeError(f"Supabase upsert failed status={status} body={resp_body[:500]}")
            sent += 1

    # Only advance state if all sends succeeded.
    state["offset"] = new_offset
    state["last_run"] = {"sent": sent}
    if not args.dry_run:
        write_state(state)

    print(f"[agentmail_to_supabase] sent={sent} offset {offset}→{new_offset}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
