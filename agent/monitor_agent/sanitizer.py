"""Secret redaction.

Applied to every log line / snippet / config value before it leaves this
machine (telemetry batches, log batches, and again before any payload is
sent to Gemini). See docs/SECURITY.md.
"""

from __future__ import annotations

import re

_SENSITIVE_KEY_WORDS = (
    "apikey",
    "token",
    "password",
    "passwd",
    "secret",
    "authorization",
    "cookie",
    "session",
    "bearer",
    "accesskey",
    "privatekey",
)

# Matches "SOME_IDENTIFIER = value" / "some.identifier: value" and redacts
# the value whenever the identifier *contains* one of the sensitive words
# (case-insensitive, ignoring separators) — real config keys are usually
# compound, e.g. WHATSAPP_SESSION_TOKEN, META_ACCESS_TOKEN, AUTH_TOKEN.
_ASSIGNMENT_PATTERN = re.compile(r"([A-Za-z][A-Za-z0-9_.\-]*)\s*[:=]\s*(\"?)([^\s\"',;]+)(\2)")

_BEARER_PATTERN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9\-_.=]+")

REDACTED = "[REDACTED]"


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("_", "").replace("-", "").replace(".", "")
    return any(word in normalized for word in _SENSITIVE_KEY_WORDS)


def _redact_assignment(match: re.Match) -> str:
    key = match.group(1)
    if _is_sensitive_key(key):
        return f"{key}={REDACTED}"
    return match.group(0)


def redact(text: str) -> str:
    if not text:
        return text
    out = _ASSIGNMENT_PATTERN.sub(_redact_assignment, text)
    out = _BEARER_PATTERN.sub(f"Bearer {REDACTED}", out)
    return out


def redact_known_secrets(text: str, known_secrets: list[str]) -> str:
    """Redact literal secret values pulled from this machine's own config
    (e.g. values read from a project's .env) wherever they appear verbatim.
    """
    out = text
    for secret in known_secrets:
        if secret and len(secret) >= 6:
            out = out.replace(secret, REDACTED)
    return out


def looks_like_secret_line(text: str) -> bool:
    if _BEARER_PATTERN.search(text):
        return True
    return any(_is_sensitive_key(m.group(1)) for m in _ASSIGNMENT_PATTERN.finditer(text))
