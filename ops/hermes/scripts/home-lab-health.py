#!/usr/bin/env python3
"""Stable, read-only health snapshot for Hermes cron monitor mode."""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any


PORTAINER_URL = os.environ.get("PORTAINER_URL", "https://192.168.1.11:9443").rstrip("/")
HEALTH_URL = os.environ.get("SAAS_HEALTH_URL", "https://www.lembrado.com.br/api/health")
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "LeoAraujoF/gestormaster")
EXPECTED_CONTAINERS = tuple(
    item.strip()
    for item in os.environ.get(
        "MONITOR_CONTAINERS",
        "cloudflared,portainer,nginx-npm-1,gestor_app,gestor_worker,gestor_scheduler,redis_queue,evolution_api,evolution_db,hermes_agent",
    ).split(",")
    if item.strip()
)


def _context() -> ssl.SSLContext:
    if os.environ.get("PORTAINER_TLS_VERIFY", "0").lower() in {"0", "false", "no"}:
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def _request(url: str, headers: dict[str, str] | None = None) -> tuple[int, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "hermes-home-lab-monitor", **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=15, context=_context() if "192.168.1.11" in url else ssl.create_default_context()) as response:
        raw = response.read().decode("utf-8", errors="replace")
        try:
            return response.status, json.loads(raw)
        except json.JSONDecodeError:
            return response.status, {"raw": raw[:200]}


def _portainer(path: str) -> Any:
    key = os.environ.get("PORTAINER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("PORTAINER_API_KEY ausente")
    _, payload = _request(f"{PORTAINER_URL}{path}", {"X-API-Key": key})
    return payload


def _normal_health(status: str) -> str:
    match = re.search(r"\((healthy|unhealthy)\)", status.lower())
    return match.group(1) if match else "none"


def _container_snapshot(container: dict[str, Any]) -> dict[str, Any]:
    names = container.get("Names") or []
    name = str(names[0] if names else container.get("Id", "unknown")).lstrip("/")
    status = str(container.get("Status", ""))
    return {
        "name": name,
        "state": str(container.get("State", "unknown")),
        "health": _normal_health(status),
        "restarts": int(container.get("RestartCount", 0) or 0),
        "image": str(container.get("Image", "unknown")),
    }


def _check_portainer(result: dict[str, Any], alerts: list[str]) -> None:
    endpoints = _portainer("/api/endpoints")
    if not isinstance(endpoints, list) or not endpoints:
        alerts.append("portainer:no-environment")
        return

    endpoint_id = os.environ.get("MONITOR_ENVIRONMENT_ID", "").strip()
    endpoint = next((item for item in endpoints if str(item.get("Id")) == endpoint_id), None)
    endpoint = endpoint or next((item for item in endpoints if item.get("Status") == 1), endpoints[0])
    environment_id = endpoint.get("Id")
    environment_status = "up" if endpoint.get("Status") == 1 else "down"
    result["portainer"] = {
        "version": str(_portainer("/api/system/status").get("Version", "unknown")),
        "environment": {
            "id": environment_id,
            "name": endpoint.get("Name", "unknown"),
            "status": environment_status,
        },
    }
    if environment_status != "up":
        alerts.append("portainer:environment-down")
        return

    docker_info = _portainer(f"/api/endpoints/{environment_id}/docker/info")
    if isinstance(docker_info, dict):
        result["portainer"]["docker"] = {
            "server_version": docker_info.get("ServerVersion", "unknown"),
            "ncpu": docker_info.get("NCPU"),
            "mem_total_bytes": docker_info.get("MemTotal"),
            "containers_running": docker_info.get("ContainersRunning"),
            "containers_stopped": docker_info.get("ContainersStopped"),
            "images": docker_info.get("Images"),
        }

    containers = _portainer(f"/api/endpoints/{environment_id}/docker/containers/json?all=true")
    by_name = {_container_snapshot(item)["name"]: _container_snapshot(item) for item in containers or []}
    result["containers"] = [by_name[name] for name in EXPECTED_CONTAINERS if name in by_name]
    missing = [name for name in EXPECTED_CONTAINERS if name not in by_name]
    alerts.extend(f"container:{name}:missing" for name in missing)
    for name in EXPECTED_CONTAINERS:
        item = by_name.get(name)
        if not item:
            continue
        if item["state"] != "running":
            alerts.append(f"container:{name}:{item['state']}")
        if item["health"] == "unhealthy":
            alerts.append(f"container:{name}:unhealthy")


def _check_saas(result: dict[str, Any], alerts: list[str]) -> None:
    try:
        status, _ = _request(HEALTH_URL)
        result["saas"] = {"health_url": HEALTH_URL, "http_status": status}
        if status != 200:
            alerts.append(f"saas:health-http-{status}")
    except Exception as exc:  # noqa: BLE001 - monitor must return a stable failure
        result["saas"] = {"health_url": HEALTH_URL, "http_status": "unreachable"}
        alerts.append(f"saas:health-unreachable:{type(exc).__name__}")


def _check_github(result: dict[str, Any], alerts: list[str]) -> None:
    try:
        commit_status, commit = _request(f"https://api.github.com/repos/{REPOSITORY}/commits/main")
        runs_status, runs = _request(f"https://api.github.com/repos/{REPOSITORY}/actions/runs?per_page=5")
        latest_run = (runs.get("workflow_runs") or [None])[0] if isinstance(runs, dict) else None
        result["github"] = {
            "repository": REPOSITORY,
            "commit": str(commit.get("sha", "unknown"))[:12] if isinstance(commit, dict) else "unknown",
            "commit_status": commit_status,
            "latest_run": {
                "id": latest_run.get("id"),
                "status": latest_run.get("status"),
                "conclusion": latest_run.get("conclusion"),
            }
            if latest_run
            else None,
            "runs_status": runs_status,
        }
        if commit_status != 200:
            alerts.append(f"github:commit-http-{commit_status}")
        if runs_status != 200:
            alerts.append(f"github:runs-http-{runs_status}")
        elif latest_run and latest_run.get("status") == "completed" and latest_run.get("conclusion") != "success":
            alerts.append(f"github:latest-run-{latest_run.get('conclusion') or 'unknown'}")
    except Exception as exc:  # noqa: BLE001 - monitor must return a stable failure
        result["github"] = {"repository": REPOSITORY, "status": "unreachable"}
        alerts.append(f"github:unreachable:{type(exc).__name__}")


def main() -> int:
    result: dict[str, Any] = {"schema": "hermes-home-lab-health.v2"}
    alerts: list[str] = []
    try:
        _check_portainer(result, alerts)
    except Exception as exc:  # noqa: BLE001 - the output itself is the alert evidence
        result["portainer"] = {"status": "unreachable"}
        alerts.append(f"portainer:unreachable:{type(exc).__name__}")
    _check_saas(result, alerts)
    _check_github(result, alerts)
    result["status"] = "healthy" if not alerts else "degraded"
    result["alerts"] = sorted(set(alerts))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
