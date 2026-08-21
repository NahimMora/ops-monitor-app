"""HTTPS client to the Ops Monitor cloud app.

Every request is outbound-only, signed with the agent secret, and
timestamped (basic replay protection: the server rejects requests whose
timestamp has drifted too far, see src/server/agent-auth.ts). On any
network/HTTP failure the caller is expected to hand the payload to the
``OfflineBuffer`` instead of losing it — see main.py's ``send_or_buffer``.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Any

import requests

from monitor_agent.config import AgentConfig


@dataclass
class ApiError(Exception):
    status_code: int | None
    message: str

    def __str__(self) -> str:
        return f"ApiError({self.status_code}): {self.message}"


class ApiClient:
    def __init__(self, config: AgentConfig) -> None:
        self._config = config
        self._session = requests.Session()

    def _sign(self, method: str, path: str, body: bytes, timestamp: str) -> str:
        message = f"{method}\n{path}\n{timestamp}\n".encode() + body
        return hmac.new(self._config.agent_secret.encode(), message, hashlib.sha256).hexdigest()

    def _request(self, method: str, path: str, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        import json as _json

        body = _json.dumps(json_body or {}, separators=(",", ":")).encode("utf-8")
        timestamp = str(int(time.time()))
        signature = self._sign(method, path, body, timestamp)

        headers = {
            "Content-Type": "application/json",
            "X-Agent-Id": self._config.agent_id,
            "X-Agent-Timestamp": timestamp,
            "X-Agent-Signature": signature,
        }
        url = f"{self._config.cloud_base_url}{path}"
        try:
            resp = self._session.request(
                method, url, data=body, headers=headers, timeout=self._config.request_timeout_seconds
            )
        except requests.RequestException as exc:
            raise ApiError(status_code=None, message=str(exc)) from exc

        if resp.status_code >= 400:
            raise ApiError(status_code=resp.status_code, message=resp.text[:500])
        if not resp.content:
            return {}
        return resp.json()

    def heartbeat(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/agent/heartbeat", payload)

    def telemetry(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/agent/telemetry", payload)

    def events_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/agent/events/batch", payload)

    def logs_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/agent/logs/batch", payload)

    def runs(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/agent/runs", payload)

    def get_commands(self) -> dict[str, Any]:
        return self._request("GET", "/api/agent/commands")

    def post_command_result(self, command_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/api/agent/commands/{command_id}/result", payload)
