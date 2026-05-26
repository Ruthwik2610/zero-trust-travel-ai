import json
import logging
from typing import Any

from .security import redact_sensitive_text


INTERNAL_LOGGER_NAME = "travel_ai.internal"
MAX_LOG_FIELD_LENGTH = 500


def log_internal_issue(
    logger: logging.Logger,
    event_type: str,
    message: str,
    *,
    level: int = logging.WARNING,
    error: Exception | None = None,
    **fields: Any,
) -> dict[str, str]:
    payload = {
        "event_type": event_type,
        "message": _safe_value(message),
    }
    if error is not None:
        payload["error_type"] = type(error).__name__
        payload["error_message"] = _safe_value(str(error))
    for key, value in fields.items():
        if value is not None:
            payload[str(key)] = _safe_value(value)

    logger.log(level, "internal_issue %s", json.dumps(payload, sort_keys=True))
    return payload


def _safe_value(value: Any) -> str:
    if isinstance(value, str):
        raw = value
    else:
        raw = json.dumps(value, default=str, sort_keys=True)
    return redact_sensitive_text(raw)[:MAX_LOG_FIELD_LENGTH]
