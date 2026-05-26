import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass
from typing import Any

from .security import EMAIL_RE, PASSPORT_RE, PHONE_RE, looks_like_phone

PERSON_KEYS = {
    "traveler_name",
    "traveller_name",
    "passenger_name",
    "employee_name",
    "approving_manager",
    "manager_name",
    "full_name",
}
EMAIL_KEYS = {"traveler_email", "traveller_email", "employee_email", "approval_manager_email", "manager_email", "email"}
PHONE_KEYS = {"phone", "phone_number", "mobile", "mobile_number", "contact_number"}
EMPLOYEE_KEYS = {"employee_id", "traveler_id", "employee_number", "staff_id"}
PASSPORT_KEYS = {"passport_number", "passport_no", "passport"}
IDENTITY_KEYS = {"identity_number", "national_id", "id_number"}
LOYALTY_KEYS = {"loyalty_number", "loyalty_account", "airline_account_ref", "hotel_account_ref"}


@dataclass(frozen=True)
class AnonymizationResult:
    payload: Any
    token_map: dict[str, str]


class PrivacyGatewayError(ValueError):
    pass


def anonymize_for_external_ai(payload: Any) -> AnonymizationResult:
    raw_values = _collect_sensitive_values(payload)
    token_map: dict[str, str] = {}
    raw_to_token: dict[tuple[str, str], str] = {}
    anonymized = _anonymize_value(payload, raw_values, token_map, raw_to_token)
    return AnonymizationResult(payload=anonymized, token_map=token_map)


def assert_no_raw_pii(payload: Any, token_map: dict[str, str]) -> None:
    serialized = json.dumps(payload, default=str, sort_keys=True)
    leaked_categories: set[str] = set()
    for token, raw_value in token_map.items():
        if raw_value and raw_value in serialized:
            leaked_categories.add(_category_from_token(token))
    if EMAIL_RE.search(serialized):
        leaked_categories.add("email")
    if PASSPORT_RE.search(serialized):
        leaked_categories.add("passport")
    if any(looks_like_phone(match.group(0)) for match in PHONE_RE.finditer(serialized)):
        leaked_categories.add("phone")
    if leaked_categories:
        categories = ", ".join(sorted(leaked_categories))
        raise PrivacyGatewayError(f"Outbound AI payload contains raw PII categories: {categories}")


def rehydrate_from_vault(value: Any, token_map: dict[str, str]) -> Any:
    if isinstance(value, dict):
        return {key: rehydrate_from_vault(item, token_map) for key, item in value.items()}
    if isinstance(value, list):
        return [rehydrate_from_vault(item, token_map) for item in value]
    if isinstance(value, str):
        clean = value
        for token, raw_value in sorted(token_map.items(), key=lambda item: len(item[0]), reverse=True):
            clean = clean.replace(token, raw_value)
        return clean
    return value


def _collect_sensitive_values(value: Any, key: str | None = None) -> list[tuple[str, str]]:
    normalized_key = _normalize_key(key)
    collected: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for child_key, child_value in value.items():
            collected.extend(_collect_sensitive_values(child_value, str(child_key)))
        return collected
    if isinstance(value, list):
        for item in value:
            collected.extend(_collect_sensitive_values(item, key))
        return collected
    if not isinstance(value, str):
        return collected
    label = _label_for_key(normalized_key)
    if label and value.strip():
        collected.append((label, value.strip()))
    return collected


def _anonymize_value(
    value: Any,
    raw_values: list[tuple[str, str]],
    token_map: dict[str, str],
    raw_to_token: dict[tuple[str, str], str],
) -> Any:
    if isinstance(value, dict):
        return {key: _anonymize_value(item, raw_values, token_map, raw_to_token) for key, item in value.items()}
    if isinstance(value, list):
        return [_anonymize_value(item, raw_values, token_map, raw_to_token) for item in value]
    if not isinstance(value, str):
        return value

    clean = value
    for label, raw_value in sorted(raw_values, key=lambda item: len(item[1]), reverse=True):
        if raw_value and raw_value in clean:
            clean = clean.replace(raw_value, _token_for(label, raw_value, token_map, raw_to_token))
    clean = EMAIL_RE.sub(lambda match: _token_for("EMAIL", match.group(0), token_map, raw_to_token), clean)
    clean = PASSPORT_RE.sub(lambda match: _token_for("PASSPORT", match.group(0), token_map, raw_to_token), clean)
    clean = PHONE_RE.sub(lambda match: _phone_replacement(match, token_map, raw_to_token), clean)
    return clean


def _phone_replacement(match: re.Match[str], token_map: dict[str, str], raw_to_token: dict[tuple[str, str], str]) -> str:
    candidate = match.group(0)
    if not looks_like_phone(candidate):
        return candidate
    return _token_for("PHONE", candidate, token_map, raw_to_token)


def _token_for(label: str, raw_value: str, token_map: dict[str, str], raw_to_token: dict[tuple[str, str], str]) -> str:
    clean = raw_value.strip()
    key = (label, clean)
    if key in raw_to_token:
        return raw_to_token[key]
    secret = os.getenv("TRAVEL_AI_TOKEN_SECRET") or "travel-ai-local-token-secret"
    digest = hmac.new(secret.encode("utf-8"), f"{label}:{clean}".encode("utf-8"), hashlib.sha256).hexdigest()[:12].upper()
    token = f"{label}_{digest}"
    raw_to_token[key] = token
    token_map[token] = clean
    return token


def _label_for_key(normalized_key: str) -> str | None:
    if normalized_key in PERSON_KEYS:
        return "PERSON"
    if normalized_key in EMAIL_KEYS or normalized_key.endswith("_email"):
        return "EMAIL"
    if normalized_key in PHONE_KEYS:
        return "PHONE"
    if normalized_key in EMPLOYEE_KEYS:
        return "EMPLOYEE_ID"
    if normalized_key in PASSPORT_KEYS:
        return "PASSPORT"
    if normalized_key in IDENTITY_KEYS:
        return "IDENTITY_ID"
    if normalized_key in LOYALTY_KEYS:
        return "LOYALTY_ID"
    return None


def _normalize_key(key: str | None) -> str:
    return (key or "").strip().lower().replace("-", "_").replace(" ", "_")


def _category_from_token(token: str) -> str:
    return token.split("_", 1)[0].lower()
