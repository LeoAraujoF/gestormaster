#!/usr/bin/env python3
"""Guarded Portainer action runner; disabled unless explicitly enabled."""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


PORTAINER_URL = os.environ.get("PORTAINER_URL", "https://192.168.1.11:9443").rstrip("/")
AUDIT_FILE = Path(os.environ.get("HERMES_ACTION_AUDIT_FILE", "/opt/data/audit/actions.jsonl"))
ALLOWED_CONTAINERS = {
    item.strip()
    for item in os.environ.get("ACTION_ALLOWED_CONTAINERS", "hermes_agent").split(",")
    if item.strip()
}


def _context() -> ssl.SSLContext:
    if os.environ.get("PORTAINER_TLS_VERIFY", "0").lower() in {"0", "false", "no"}:
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def _request(path: str, method: str = "GET") -> tuple[int, Any]:
    key = os.environ.get("PORTAINER_ACTION_API_KEY", "").strip()
    if not key:
        raise RuntimeError("PORTAINER_ACTION_API_KEY ausente")
    request = urllib.request.Request(
        f"{PORTAINER_URL}{path}",
        method=method,
        headers={"Accept": "application/json", "X-API-Key": key, "User-Agent": "hermes-approved-action"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20, context=_context()) as response:
            raw = response.read().decode("utf-8", errors="replace")
            try:
                return response.status, json.loads(raw)
            except json.JSONDecodeError:
                return response.status, {"raw": raw[:200]}
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Portainer HTTP {exc.code}") from exc


def _audit(entry: dict[str, Any]) -> None:
    AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
    AUDIT_FILE.touch(mode=0o600, exist_ok=True)
    os.chmod(AUDIT_FILE, 0o600)
    with AUDIT_FILE.open("a", encoding="utf-8") as stream:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        stream.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def main() -> int:
    parser = argparse.ArgumentParser(description="Executa somente ações Portainer aprovadas")
    parser.add_argument("--action", choices=("restart-container",), required=True)
    parser.add_argument("--container", required=True)
    parser.add_argument("--operator", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--confirm", required=True, help='valor literal: "CONFIRMAR"')
    parser.add_argument("--environment-id", default=os.environ.get("MONITOR_ENVIRONMENT_ID", "3"))
    args = parser.parse_args()

    base = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "action": args.action,
        "container": args.container,
        "operator": args.operator[:120],
        "reason": args.reason[:500],
        "environment_id": args.environment_id,
    }

    def fail(message: str) -> int:
        _audit({**base, "result": "rejected", "message": message})
        print(f"AÇÃO NÃO EXECUTADA: {message}")
        return 2

    if os.environ.get("PORTAINER_ACTIONS_ENABLED", "0").lower() not in {"1", "true", "yes"}:
        return fail("ações Portainer estão desabilitadas")
    if args.confirm != "CONFIRMAR":
        return fail('confirmação literal ausente; use --confirm "CONFIRMAR"')
    if args.container not in ALLOWED_CONTAINERS:
        return fail("container fora da allowlist")

    containers = _request(f"/api/endpoints/{urllib.parse.quote(args.environment_id, safe='')}/docker/containers/json?all=true")[1]
    match = next(
        (
            item
            for item in (containers if isinstance(containers, list) else [])
            if args.container in {str(name).lstrip("/") for name in item.get("Names", [])}
        ),
        None,
    )
    if not match or not match.get("Id"):
        return fail("container não encontrado no ambiente informado")

    container_id = str(match["Id"])
    path = f"/api/endpoints/{urllib.parse.quote(args.environment_id, safe='')}/docker/containers/{urllib.parse.quote(container_id, safe='')}/restart?t=10"
    status, _ = _request(path, method="POST")
    if status not in {200, 204}:
        return fail(f"Portainer retornou HTTP {status}")
    _audit({**base, "result": "accepted", "http_status": status, "container_id_prefix": container_id[:12]})
    print(f"AÇÃO ACEITA: restart de {args.container}; valide o health check antes de encerrar o incidente.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
