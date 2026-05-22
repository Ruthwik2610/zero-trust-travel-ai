from datetime import date, timedelta
from pathlib import Path

from app.models import TravelRequest, Trip
from app.security import SensitiveFieldCipher, SecurityError, create_access_token, public_error_message, redact_sensitive_text, risk_label, verify_access_token
from app.store import TravelStore


def test_redact_sensitive_text_masks_private_identifiers():
    text = (
        "Email traveler@example.com passport A1234567 "
        "Authorization: Bearer sk-or-v1-secretvalue and token sk-live-abcdef1234567890"
    )

    redacted = redact_sensitive_text(text)

    assert "traveler@example.com" not in redacted
    assert "A1234567" not in redacted
    assert "sk-or-v1-secretvalue" not in redacted
    assert "sk-live-abcdef1234567890" not in redacted
    assert "[redacted-email]" in redacted
    assert "[redacted-id]" in redacted
    assert "[redacted-token]" in redacted


def test_public_error_message_never_returns_internal_text():
    exc = RuntimeError("OPENROUTER_API_KEY missing for traveler@example.com")

    assert public_error_message(exc) == "We could not complete that request safely. Please try again."


def test_risk_label_escalates_for_international_premium_short_window_and_budget():
    request = TravelRequest(
        origin="SFO",
        destination="Tokyo, Japan",
        depart_date=date.today() + timedelta(days=2),
        return_date=date.today() + timedelta(days=7),
        travelers=1,
        cabin="business",
        budget_usd=800,
    )

    assert risk_label(request) == "high"


def test_access_tokens_are_short_lived_and_reject_expired_tokens(monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    token, context = create_access_token("demo.user@unipro.com", ttl_seconds=60)

    verified = verify_access_token(token)

    assert verified.user_id == context.user_id
    expired, _ = create_access_token("demo.user@unipro.com", ttl_seconds=-1)
    try:
        verify_access_token(expired)
    except SecurityError as exc:
        assert "expired" in str(exc).lower()
    else:
        raise AssertionError("expired token was accepted")


def test_sensitive_payloads_are_encrypted_outside_public_trip_json(tmp_path, monkeypatch):
    monkeypatch.setenv("TRAVEL_AI_TOKEN_SECRET", "test-token-secret")
    store = TravelStore(tmp_path / "travel_ai.db")
    trip = Trip(
        owner_id="usr_demo",
        owner_department="sales",
        request=TravelRequest(
            origin="SFO",
            destination="Tokyo, Japan",
            depart_date=date.today() + timedelta(days=14),
            travelers=1,
        ),
        sensitive_context={"passport_number": "A1234567", "calendar_event": "Board meeting with client"},
    )

    store.save_trip(trip)
    raw_db = Path(tmp_path / "travel_ai.db").read_bytes()

    assert b"A1234567" not in raw_db
    assert b"Board meeting" not in raw_db
    listed = store.list_trips_for_owner("usr_demo")
    assert listed[0].sensitive_context == {}
    with store._connect() as conn:
        encrypted = conn.execute("SELECT sensitive_payload_json FROM trips WHERE id = ?", (trip.id,)).fetchone()[0]
    decrypted = SensitiveFieldCipher().decrypt_json(encrypted)
    assert decrypted["passport_number"] == "A1234567"


def test_llm_agent_module_does_not_import_storage_or_sqlite():
    agent_source = Path("backend/app/agent.py").read_text()

    assert "TravelStore" not in agent_source
    assert "sqlite3" not in agent_source
