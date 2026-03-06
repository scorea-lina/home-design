#!/usr/bin/env python3
"""AgentMail poller.

Fetches new threads/messages from AgentMail and appends them to a JSONL inbox log
that all OpenClaw agents can read.

State is stored in a small JSON file tracking last-seen message timestamps.

This script intentionally only READS mail.

Env/config:
- AGENTMAIL_API_KEY_FILE: path to file containing API key (default: ~/.openclaw/secrets/agentmail_api_key)
- AGENTMAIL_INBOX_ADDRESS: target inbox address (default: astratora@agentmail.to)
- AGENTMAIL_OUT_JSONL: output jsonl path (default: ~/.openclaw/workspace/inbox/agentmail.jsonl)
- AGENTMAIL_STATE_JSON: state path (default: ~/.openclaw/workspace/inbox/agentmail_state.json)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

API_BASE = "https://api.agentmail.to/v0"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_key(path: Path) -> str:
    key = path.read_text().strip()
    if not key:
        raise RuntimeError(f"Empty API key file: {path}")
    return key


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True))


def agentmail_get(key: str, url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    r = requests.get(
        url,
        headers={"Authorization": f"Bearer {key}"},
        params=params or {},
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"AgentMail GET failed {r.status_code}: {r.text[:400]}")
    return r.json()


def list_inboxes(key: str) -> List[Dict[str, Any]]:
    data = agentmail_get(key, f"{API_BASE}/inboxes", params={"limit": 100})
    # AgentMail returns an object; try common shapes.
    if isinstance(data, dict):
        for k in ("inboxes", "data", "items"):
            if k in data and isinstance(data[k], list):
                return data[k]
    if isinstance(data, list):
        return data
    raise RuntimeError(f"Unexpected inbox list shape: {type(data)}")


def pick_inbox_id(inboxes: List[Dict[str, Any]], address: str) -> str:
    addr = address.lower().strip()
    # try common fields
    for inbox in inboxes:
        for field in ("address", "email", "email_address", "inbox_address"):
            v = inbox.get(field)
            if isinstance(v, str) and v.lower() == addr:
                return str(inbox.get("inbox_id") or inbox.get("id") or inbox.get("inboxId"))
    # fallback: if only one inbox, use it
    if len(inboxes) == 1:
        inbox = inboxes[0]
        return str(inbox.get("inbox_id") or inbox.get("id") or inbox.get("inboxId"))
    raise RuntimeError(f"Could not find inbox for address={address}. Inboxes seen={len(inboxes)}")


def list_threads(key: str, inbox_id: str, limit: int = 25) -> List[Dict[str, Any]]:
    data = agentmail_get(key, f"{API_BASE}/inboxes/{inbox_id}/threads", params={"limit": limit})
    if isinstance(data, dict):
        for k in ("threads", "data", "items"):
            if k in data and isinstance(data[k], list):
                return data[k]
    if isinstance(data, list):
        return data
    raise RuntimeError(f"Unexpected thread list shape: {type(data)}")


def get_thread(key: str, inbox_id: str, thread_id: str) -> Dict[str, Any]:
    return agentmail_get(key, f"{API_BASE}/inboxes/{inbox_id}/threads/{thread_id}")


def extract_messages(thread: Dict[str, Any]) -> List[Dict[str, Any]]:
    # common shapes: thread["messages"] or thread["data"]["messages"]
    if "messages" in thread and isinstance(thread["messages"], list):
        return thread["messages"]
    if "data" in thread and isinstance(thread["data"], dict) and isinstance(thread["data"].get("messages"), list):
        return thread["data"]["messages"]
    return []


def msg_timestamp(msg: Dict[str, Any]) -> Optional[float]:
    # try a few timestamp fields
    for field in ("received_at", "created_at", "timestamp", "date"):
        v = msg.get(field)
        if isinstance(v, (int, float)):
            # assume ms if too large
            return float(v) / (1000.0 if v > 10_000_000_000 else 1.0)
        if isinstance(v, str):
            try:
                # parse ISO-ish
                dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
                return dt.timestamp()
            except Exception:
                pass
    return None


def stable_msg_id(msg: Dict[str, Any]) -> str:
    return str(msg.get("message_id") or msg.get("id") or msg.get("messageId") or "")


def append_jsonl(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")


def main() -> int:
    key_file = Path(os.environ.get("AGENTMAIL_API_KEY_FILE", os.path.expanduser("~/.openclaw/secrets/agentmail_api_key")))
    inbox_addr = os.environ.get("AGENTMAIL_INBOX_ADDRESS", "astratora@agentmail.to")
    out_jsonl = Path(os.environ.get("AGENTMAIL_OUT_JSONL", os.path.expanduser("~/.openclaw/workspace/inbox/agentmail.jsonl")))
    state_json = Path(os.environ.get("AGENTMAIL_STATE_JSON", os.path.expanduser("~/.openclaw/workspace/inbox/agentmail_state.json")))

    key = read_key(key_file)
    state = load_json(state_json, default={"lastSeenTs": 0, "lastSeenMsgId": ""})
    last_seen_ts = float(state.get("lastSeenTs") or 0)

    inboxes = list_inboxes(key)
    inbox_id = pick_inbox_id(inboxes, inbox_addr)

    threads = list_threads(key, inbox_id, limit=25)

    new_rows: List[Dict[str, Any]] = []
    max_ts = last_seen_ts
    max_id = state.get("lastSeenMsgId") or ""

    for th in threads:
        thread_id = str(th.get("thread_id") or th.get("id") or th.get("threadId") or "")
        if not thread_id:
            continue
        full = get_thread(key, inbox_id, thread_id)
        messages = extract_messages(full)
        for msg in messages:
            ts = msg_timestamp(msg) or 0
            mid = stable_msg_id(msg)
            if ts <= last_seen_ts:
                continue
            # basic row for shared log
            row = {
                "fetched_at": utc_now_iso(),
                "inbox_address": inbox_addr,
                "inbox_id": inbox_id,
                "thread_id": thread_id,
                "message_id": mid,
                "ts": ts,
                "from": msg.get("from") or msg.get("sender") or msg.get("from_address"),
                "to": msg.get("to") or msg.get("recipients") or msg.get("to_addresses"),
                "subject": msg.get("subject"),
                "text": msg.get("text") or msg.get("body") or msg.get("content") or msg.get("snippet"),
                "raw": msg,
            }
            new_rows.append(row)
            if ts > max_ts:
                max_ts = ts
                max_id = mid

    if new_rows:
        # sort by timestamp ascending
        new_rows.sort(key=lambda r: (r.get("ts") or 0))
        append_jsonl(out_jsonl, new_rows)
        save_json(state_json, {"lastSeenTs": max_ts, "lastSeenMsgId": max_id, "updatedAt": utc_now_iso()})

    print(json.dumps({"ok": True, "new": len(new_rows), "inbox": inbox_addr, "out": str(out_jsonl)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        raise
