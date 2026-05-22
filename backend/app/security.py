import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import date
from typing import Any, Literal

from cryptography.fernet import Fernet, InvalidToken

from .models import AuthContext, TravelRequest


Risk = Literal["low", "medium", "high"]

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE)
API_KEY_RE = re.compile(r"\b(?:sk|pk|api|key|token)[-_]?[A-Za-z0-9][A-Za-z0-9._-]{12,}\b", re.IGNORECASE)
PASSPORT_RE = re.compile(r"\b[A-Z][0-9]{7,8}\b")

TOKEN_TTL_SECONDS = 15 * 60
TOKEN_VERSION = "travel-ai-v1"

TRAVELER_AGENT_CHAIN = {
    "trip_intake": {"travel:plan"},
    "calendar_availability": {"calendar:freebusy"},
    "policy_budget": {"policy:read", "budget:self"},
    "visa_compliance": {"visa:self"},
    "offer_search": {"supplier:search"},
    "approval_itinerary": {"self:trips"},
}

DEMO_IDENTITIES: dict[str, dict[str, Any]] = {
    "demo.user@unipro.com": {
        "user_id": "usr_demo",
        "role": "traveler",
        "department": "sales",
        "scopes": [
            "travel:plan",
            "calendar:freebusy",
            "policy:read",
            "budget:self",
            "visa:self",
            "supplier:search",
            "self:trips",
        ],
        "manager_scope": [],
    },
    "client.lead@unipro.com": {
        "user_id": "usr_client_lead",
        "role": "traveler",
        "department": "sales",
        "scopes": [
            "travel:plan",
            "calendar:freebusy",
            "policy:read",
            "budget:self",
            "visa:self",
            "supplier:search",
            "self:trips",
        ],
        "manager_scope": [],
    },
    "admin.user@unipro.com": {
        "user_id": "usr_admin",
        "role": "travel_manager",
        "department": "travel_ops",
        "scopes": [
            "travel:plan",
            "calendar:freebusy",
            "budget:self",
            "visa:self",
            "supplier:search",
            "self:trips",
            "admin:summary",
            "admin:audit",
            "approval:read",
            "budget:aggregate",
            "policy:read",
            "policy:write",
            "visa:aggregate",
        ],
        "manager_scope": ["sales", "engineering", "finance", "travel_ops"],
    },
    "demo.agent@unipro.com": {
        "user_id": "usr_demo_agent",
        "role": "travel_manager",
        "department": "travel_ops",
        "scopes": [
            "travel:plan",
            "calendar:freebusy",
            "budget:self",
            "visa:self",
            "supplier:search",
            "self:trips",
            "admin:summary",
            "admin:audit",
            "approval:read",
            "budget:aggregate",
            "policy:read",
            "policy:write",
            "visa:aggregate",
        ],
        "manager_scope": ["sales", "engineering", "finance", "travel_ops"],
    },
    "travel.manager@unipro.com": {
        "user_id": "usr_travel_manager",
        "role": "travel_manager",
        "department": "travel_ops",
        "scopes": [
            "travel:plan",
            "calendar:freebusy",
            "budget:self",
            "visa:self",
            "supplier:search",
            "self:trips",
            "admin:summary",
            "admin:audit",
            "approval:read",
            "budget:aggregate",
            "policy:read",
            "policy:write",
            "visa:aggregate",
        ],
        "manager_scope": ["sales", "engineering", "finance", "travel_ops"],
    },
}


class SecurityError(ValueError):
    pass


def redact_sensitive_text(text: str) -> str:
    redacted = EMAIL_RE.sub("[redacted-email]", text)
    redacted = BEARER_RE.sub("[redacted-token]", redacted)
    redacted = API_KEY_RE.sub("[redacted-token]", redacted)
    redacted = PASSPORT_RE.sub("[redacted-id]", redacted)
    return redacted


def public_error_message(exc: Exception) -> str:
    return "We could not complete that request safely. Please try again."


def risk_label(request: TravelRequest) -> Risk:
    score = 0
    destination = request.destination.lower()
    international_hint = "," in destination or any(
        marker in destination
        for marker in (" japan", " france", " india", " london", " tokyo", " paris", " mexico", " canada")
    )
    if international_hint:
        score += 1
    if request.cabin in {"business", "first"}:
        score += 1
    if (request.depart_date - date.today()).days <= 7:
        score += 1

    estimated_total = _estimated_total(request)
    if request.budget_usd and estimated_total > request.budget_usd:
        score += 1

    if score >= 3:
        return "high"
    if score >= 1:
        return "medium"
    return "low"


def create_access_token(email: str, ttl_seconds: int = TOKEN_TTL_SECONDS) -> tuple[str, AuthContext]:
    context = demo_auth_context(email, expires_at=int(time.time()) + ttl_seconds)
    payload = context.model_dump()
    payload["version"] = TOKEN_VERSION
    encoded_payload = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _sign(encoded_payload.encode("ascii"))
    return f"{encoded_payload}.{signature}", context


def verify_access_token(token: str) -> AuthContext:
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise SecurityError("Malformed access token") from exc
    expected = _sign(encoded_payload.encode("ascii"))
    if not hmac.compare_digest(signature, expected):
        raise SecurityError("Invalid access token signature")
    try:
        payload = json.loads(_b64decode(encoded_payload))
    except (json.JSONDecodeError, ValueError) as exc:
        raise SecurityError("Invalid access token payload") from exc
    if payload.get("version") != TOKEN_VERSION:
        raise SecurityError("Unsupported access token")
    context = AuthContext.model_validate(payload)
    if context.token_expires_at <= int(time.time()):
        raise SecurityError("Access token expired")
    return context


def demo_auth_context(email: str, expires_at: int | None = None) -> AuthContext:
    normalized = email.strip().lower()
    profile = DEMO_IDENTITIES.get(normalized)
    if not profile:
        profile = {
            "user_id": f"usr_{hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:12]}",
            "role": "traveler",
            "department": "general",
            "scopes": [
                "travel:plan",
                "calendar:freebusy",
                "policy:read",
                "budget:self",
                "visa:self",
                "supplier:search",
                "self:trips",
            ],
            "manager_scope": [],
        }
    return AuthContext(
        user_id=profile["user_id"],
        email=normalized,
        role=profile["role"],
        department=profile["department"],
        scopes=list(profile["scopes"]),
        manager_scope=list(profile["manager_scope"]),
        token_expires_at=expires_at or int(time.time()) + TOKEN_TTL_SECONDS,
    )


def require_purpose(purpose: str | None) -> str:
    normalized = (purpose or "").strip().lower()
    if len(normalized) < 6:
        raise SecurityError("Purpose is required")
    return normalized[:160]


def ensure_scope(context: AuthContext, required_scope: str, purpose: str) -> None:
    require_purpose(purpose)
    if required_scope not in context.scopes:
        raise SecurityError(f"Scope denied: {required_scope}")


def ensure_any_scope(context: AuthContext, required_scopes: set[str], purpose: str) -> None:
    require_purpose(purpose)
    if not required_scopes.intersection(context.scopes):
        raise SecurityError(f"Scope denied: {', '.join(sorted(required_scopes))}")


def authorize_traveler_agent_chain(context: AuthContext, purpose: str) -> None:
    require_purpose(purpose)
    for scopes in TRAVELER_AGENT_CHAIN.values():
        missing = scopes.difference(context.scopes)
        if missing:
            raise SecurityError(f"Agent scope denied: {', '.join(sorted(missing))}")


class SensitiveFieldCipher:
    def __init__(self, key: str | None = None) -> None:
        self._fernet = Fernet(key or _encryption_key())

    def encrypt_json(self, payload: dict[str, Any]) -> str:
        if not payload:
            return ""
        raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return self._fernet.encrypt(raw).decode("ascii")

    def decrypt_json(self, token: str | None) -> dict[str, Any]:
        if not token:
            return {}
        try:
            raw = self._fernet.decrypt(token.encode("ascii"))
        except InvalidToken as exc:
            raise SecurityError("Sensitive payload could not be decrypted") from exc
        return json.loads(raw)


def pseudonymous_ref(value: str) -> str:
    digest = hmac.new(_token_secret().encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"traveler-{digest[:10]}"


def _estimated_total(request: TravelRequest) -> int:
    nights = 2
    if request.return_date:
        nights = max(1, (request.return_date - request.depart_date).days)
    cabin_multiplier = {"economy": 1, "premium_economy": 1.35, "business": 2.4, "first": 3.5}[request.cabin]
    flight = int(420 * cabin_multiplier * request.travelers)
    hotel = 180 * nights
    return flight + hotel


def _sign(payload: bytes) -> str:
    digest = hmac.new(_token_secret().encode("utf-8"), payload, hashlib.sha256).digest()
    return _b64encode(digest)


def _token_secret() -> str:
    return os.getenv("TRAVEL_AI_TOKEN_SECRET") or os.getenv("API_KEY") or "travel-ai-local-development-secret"


def _encryption_key() -> str:
    configured = os.getenv("TRAVEL_AI_ENCRYPTION_KEY")
    if configured:
        return configured
    digest = hashlib.sha256(f"{_token_secret()}:field-encryption".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii")


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))
